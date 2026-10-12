import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagerStory,
  persistStoryEntries,
  requireStoryEntries,
  rivalryEventKey,
} from "./manager-stories.ts";
import { buildManagers } from "./manager-profiles.ts";
import { matchupIdentityKey } from "./matchup-identity.ts";
import type { RawSeason, RawTeam } from "./league.server.ts";

const managerHelpers = {
  teamManagers: (
    _season: { members?: Array<{ id?: string; displayName?: string }> },
    team: { owners?: string[] },
  ) =>
    (team.owners ?? []).map((id) =>
      id.startsWith("samuel-") ? (id === "samuel-a" ? "Samuel Myers" : "  samuel   myers ") : id,
    ),
  teamName: (team: { id?: number }) => "Team " + team.id,
};

test("saved story read failures propagate a clear error", () => {
  assert.throws(
    () => requireStoryEntries(null, { message: "permission denied" }),
    /Unable to load manager story entries: permission denied/,
  );
});

test("a successful empty story read remains an empty result", () => {
  assert.deepEqual(requireStoryEntries([], null), []);
  assert.deepEqual(requireStoryEntries(null, null), []);
});

test("a team shared by duplicate normalized owner names counts once on the manager profile", () => {
  const managers = buildManagers(
    [
      {
        seasonId: 2024,
        teams: [
          {
            id: 1,
            owners: ["samuel-a", "samuel-b", "Lee Jennings"],
            record: { overall: { wins: 10, losses: 4, pointsFor: 1800, pointsAgainst: 1600 } },
          },
        ],
      },
    ],
    managerHelpers,
  );

  const samuel = managers.find((manager) => manager.key === "samuel myers");
  assert.equal(samuel?.wins, 10);
  assert.equal(samuel?.pointsFor, 1800);
  assert.equal(samuel?.seasons.length, 1);
  assert.equal(managers.find((manager) => manager.key === "lee jennings")?.wins, 10);
});

test("Manager Stories includes games from both owner accounts under the existing profile key", () => {
  const season: RawSeason = {
    seasonId: 2024,
    members: [
      { id: "samuel-a", displayName: "Samuel Myers" },
      { id: "samuel-b", displayName: " Samuel   Myers " },
      { id: "opponent-a", displayName: "Opponent A" },
      { id: "opponent-b", displayName: "Opponent B" },
    ],
    teams: [
      { id: 1, name: "Samuel A", owners: ["samuel-a"] },
      { id: 2, name: "Samuel B", owners: ["samuel-b"] },
      { id: 3, name: "Opponent A", owners: ["opponent-a"] },
      { id: 4, name: "Opponent B", owners: ["opponent-b"] },
    ],
    schedule: [
      {
        matchupPeriodId: 1,
        winner: "HOME",
        home: { teamId: 1, totalPoints: 120 },
        away: { teamId: 3, totalPoints: 100 },
      },
      {
        matchupPeriodId: 1,
        winner: "AWAY",
        home: { teamId: 2, totalPoints: 90 },
        away: { teamId: 4, totalPoints: 130 },
      },
      {
        matchupPeriodId: 1,
        winner: "AWAY",
        home: { teamId: 2, totalPoints: 90 },
        away: { teamId: 4, totalPoints: 130 },
      },
      {
        matchupPeriodId: 2,
        winner: "AWAY",
        home: { teamId: 1, totalPoints: 85 },
        away: { teamId: 4, totalPoints: 90 },
      },
      {
        matchupPeriodId: 2,
        winner: "HOME",
        home: { teamId: 2, totalPoints: 110 },
        away: { teamId: 3, totalPoints: 105 },
      },
      {
        matchupPeriodId: 3,
        winner: "HOME",
        home: { teamId: 1, totalPoints: 105 },
        away: { teamId: 3, totalPoints: 100 },
      },
      {
        matchupPeriodId: 3,
        winner: "HOME",
        home: { teamId: 2, totalPoints: 108 },
        away: { teamId: 4, totalPoints: 102 },
      },
      {
        matchupPeriodId: 4,
        winner: "HOME",
        home: { teamId: 1, totalPoints: 100 },
        away: { teamId: 4, totalPoints: 90 },
      },
      {
        matchupPeriodId: 4,
        winner: "AWAY",
        home: { teamId: 2, totalPoints: 95 },
        away: { teamId: 3, totalPoints: 110 },
      },
      {
        matchupPeriodId: 5,
        winner: "HOME",
        home: { teamId: 1, totalPoints: 200 },
        away: { teamId: 3, totalPoints: 120 },
      },
      {
        matchupPeriodId: 5,
        winner: "HOME",
        home: { teamId: 1, totalPoints: 200 },
        away: { teamId: 3, totalPoints: 120 },
      },
    ],
  };
  const helpers: {
    teamManagers: (rawSeason: RawSeason, team: RawTeam) => string[];
    teamName: (team: RawTeam) => string;
  } = {
    teamManagers: (rawSeason, team) =>
      (team.owners ?? []).map(
        (id) => rawSeason.members?.find((member) => member.id === id)?.displayName ?? "",
      ),
    teamName: (team) => team.name ?? "",
  };

  const first = buildManagerStory("samuel myers", "Samuel Myers", [season], [], helpers);
  assert.equal(first.story.careerSummary?.manager_key, "samuel myers");
  assert.match(first.story.careerSummary?.content ?? "", /across 9 completed matchups/);
  assert.equal(first.additions.filter((entry) => entry.entry_type === "week_evaluation").length, 5);
  assert.equal(
    first.additions.filter((entry) => entry.event_key === "career-high:2024:5:1").length,
    1,
  );
  assert.equal(
    new Set(first.additions.map((entry) => entry.event_key)).size,
    first.additions.length,
  );

  const retried = buildManagerStory(
    "samuel myers",
    "Samuel Myers",
    [season],
    first.additions,
    helpers,
  );
  assert.equal(retried.additions.length, 0);
});

function completedWeekSeason(managerPlays: boolean): RawSeason {
  return {
    seasonId: 2025,
    members: [
      { id: "manager", displayName: "Manager" },
      { id: "opponent", displayName: "Opponent" },
      { id: "other-a", displayName: "Other A" },
      { id: "other-b", displayName: "Other B" },
    ],
    teams: [
      { id: 1, name: "Manager", owners: ["manager"] },
      { id: 2, name: "Opponent", owners: ["opponent"] },
      { id: 3, name: "Other A", owners: ["other-a"] },
      { id: 4, name: "Other B", owners: ["other-b"] },
    ],
    schedule: [
      {
        matchupPeriodId: 1,
        winner: "TIE",
        home: { teamId: managerPlays ? 1 : 3, totalPoints: 100 },
        away: { teamId: managerPlays ? 2 : 4, totalPoints: 100 },
      },
    ],
  };
}

const storyHelpers = {
  teamManagers: (season: RawSeason, team: RawTeam) =>
    (team.owners ?? []).map(
      (id) => season.members?.find((member) => member.id === id)?.displayName ?? "",
    ),
  teamName: (team: RawTeam) => team.name ?? "",
};

test("eligible completed manager week gets an evaluation marker without a new chapter", () => {
  const season = completedWeekSeason(true);
  const established = buildManagerStory("manager", "Manager", [season], [], storyHelpers);
  const existing = established.additions.filter((entry) => entry.entry_type !== "week_evaluation");
  const built = buildManagerStory("manager", "Manager", [season], existing, storyHelpers);
  assert.equal(
    built.additions.some((entry) => entry.entry_type !== "week_evaluation"),
    false,
  );
  assert.equal(
    built.additions.some(
      (entry) => entry.entry_type === "week_evaluation" && entry.event_key === "evaluation:2025:1",
    ),
    true,
  );
});

test("completed week without a manager matchup creates no story entries", () => {
  const built = buildManagerStory(
    "manager",
    "Manager",
    [completedWeekSeason(false)],
    [],
    storyHelpers,
  );
  assert.deepEqual(built.additions, []);
});

test("reprocessing an evaluated manager week creates no duplicate entries", () => {
  const season = completedWeekSeason(true);
  const first = buildManagerStory("manager", "Manager", [season], [], storyHelpers);
  const again = buildManagerStory("manager", "Manager", [season], first.additions, storyHelpers);
  assert.equal(first.additions.filter((entry) => entry.entry_type === "week_evaluation").length, 1);
  assert.deepEqual(again.additions, []);
});

test("failed persistence leaves a manager week eligible for a successful retry", async () => {
  const season = completedWeekSeason(true);
  const first = buildManagerStory("manager", "Manager", [season], [], storyHelpers);
  const stored = new Map<string, (typeof first.additions)[number]>();
  const failed = await persistStoryEntries(first.additions, async () => ({
    error: new Error("offline"),
  }));
  assert.equal(failed, false);
  assert.equal(stored.size, 0);

  const retry = buildManagerStory(
    "manager",
    "Manager",
    [season],
    [...stored.values()],
    storyHelpers,
  );
  const saved = await persistStoryEntries(retry.additions, async (entries) => {
    for (const entry of entries) stored.set(entry.event_key, entry);
    return { error: null };
  });
  assert.equal(saved, true);
  assert.equal(
    [...stored.values()].filter((entry) => entry.entry_type === "week_evaluation").length,
    1,
  );
  const repeated = buildManagerStory(
    "manager",
    "Manager",
    [season],
    [...stored.values()],
    storyHelpers,
  );
  assert.deepEqual(repeated.additions, []);
});

test("thrown persistence exception is a failure and permits a successful retry", async () => {
  const season = completedWeekSeason(true);
  const first = buildManagerStory("manager", "Manager", [season], [], storyHelpers);
  const stored = new Map<string, (typeof first.additions)[number]>();
  const failed = await persistStoryEntries(first.additions, async () => {
    throw new Error("connection dropped");
  });
  assert.equal(failed, false);
  assert.equal(stored.size, 0);

  const retry = buildManagerStory(
    "manager",
    "Manager",
    [season],
    [...stored.values()],
    storyHelpers,
  );
  const saved = await persistStoryEntries(retry.additions, async (entries) => {
    for (const entry of entries) stored.set(entry.event_key, entry);
    return { error: null };
  });
  assert.equal(saved, true);
  assert.equal(
    [...stored.values()].filter((entry) => entry.entry_type === "week_evaluation").length,
    1,
  );
});

test("stable matchup identity deduplicates direction but keeps different weeks and seasons", () => {
  const base = matchupIdentityKey({ season: 2024, week: 1, homeId: 1, awayId: 2 });
  assert.equal(base, matchupIdentityKey({ season: 2024, week: 1, homeId: 2, awayId: 1 }));
  assert.notEqual(base, matchupIdentityKey({ season: 2024, week: 2, homeId: 1, awayId: 2 }));
  assert.notEqual(base, matchupIdentityKey({ season: 2025, week: 1, homeId: 1, awayId: 2 }));
});

test("rivalry event keys distinguish the A.B and AB owner identities", () => {
  const dottedNameOwnerId = ["espn-owner:A.B"];
  const plainNameOwnerId = ["espn-owner:AB"];
  assert.notEqual(
    rivalryEventKey(2026, 4, dottedNameOwnerId),
    rivalryEventKey(2026, 4, plainNameOwnerId),
  );
});

test("rivalry event keys are stable regardless of owner ID order or duplicates", () => {
  assert.equal(
    rivalryEventKey(2026, 4, ["owner-b", "owner-a", "owner-a"]),
    rivalryEventKey(2026, 4, ["owner-a", "owner-b"]),
  );
});
