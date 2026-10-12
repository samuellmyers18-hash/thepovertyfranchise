import type { RawMatch, RawSeason, RawTeam } from "./league.server";
import { dedupeMatchups, matchupIdentityKey } from "./matchup-identity.ts";

export type StoryType = "career_summary" | "current_season_summary" | "chapter" | "week_evaluation";
export type StorySection = "career_foundation" | "defining_moment" | "rivalry" | null;
export type ManagerStoryEntry = {
  manager_key: string;
  entry_type: StoryType;
  section: StorySection;
  season: number;
  week: number;
  event_key: string;
  title: string | null;
  content: string;
  created_at?: string;
};

export function requireStoryEntries(
  data: ManagerStoryEntry[] | null,
  error: { message: string } | null,
): ManagerStoryEntry[] {
  if (error) throw new Error(`Unable to load manager story entries: ${error.message}`);
  return data ?? [];
}

export async function persistStoryEntries(
  entries: ManagerStoryEntry[],
  persist: (entries: ManagerStoryEntry[]) => Promise<{ error: unknown }>,
) {
  if (!entries.length) return true;
  try {
    const { error } = await persist(entries);
    return !error;
  } catch {
    return false;
  }
}

export type ManagerRivalry = {
  opponent: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  latest: string;
};
export type ManagerStory = {
  available: boolean;
  careerSummary: ManagerStoryEntry | null;
  careerSummaryHistory: ManagerStoryEntry[];
  currentSeasonSummary: ManagerStoryEntry | null;
  currentSeasonHistory: ManagerStoryEntry[];
  careerFoundation: ManagerStoryEntry | null;
  definingMoments: ManagerStoryEntry[];
  rivalryChapters: ManagerStoryEntry[];
  rivalries: ManagerRivalry[];
  latestChapter: ManagerStoryEntry | null;
};
type Helpers = {
  teamManagers: (season: RawSeason, team: RawTeam) => string[];
  teamName: (team: RawTeam) => string;
};
type Game = {
  season: number;
  week: number;
  playoff: boolean;
  homeId: number;
  awayId: number;
  homeTeam: string;
  awayTeam: string;
  homeOwnerIds: string[];
  awayOwnerIds: string[];
  homeManagers: string[];
  awayManagers: string[];
  homePoints: number;
  awayPoints: number;
  winner: "HOME" | "AWAY" | "TIE";
};
type Week = { season: number; week: number; games: Game[] };

const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export function rivalryEventKey(season: number, week: number, ownerIds: string[]) {
  // JSON preserves tuple boundaries; URI encoding makes the identity safe in
  // the colon-delimited key even if an ESPN owner ID contains punctuation.
  const identity = JSON.stringify([...new Set(ownerIds)].sort());
  return "rivalry:" + season + ":" + week + ":" + encodeURIComponent(identity);
}
const isWinner = (s: string | undefined): s is Game["winner"] =>
  s === "HOME" || s === "AWAY" || s === "TIE";
const show = (n: number) => n.toFixed(1);

function finalPoints(match: RawMatch, side: "home" | "away") {
  const team = match[side];
  if (finite(team?.totalPoints)) return team.totalPoints;
  const split = team?.pointsByScoringPeriod ?? team?.cumulativeScore?.scoreByScoringPeriod;
  if (!split) return null;
  const values = Object.values(split);
  return values.length && values.every(finite)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function completedWeeks(seasons: RawSeason[], helpers: Helpers): Week[] {
  const result: Week[] = [];
  for (const season of seasons) {
    if (season.seasonId == null) continue;
    const teams = new Map(
      (season.teams ?? [])
        .filter((team): team is RawTeam & { id: number } => team.id != null)
        .map((team) => [team.id, team]),
    );
    const schedule = new Map<number, RawMatch[]>();
    for (const match of season.schedule ?? []) {
      if (match.matchupPeriodId == null || match.matchupPeriodId <= 0) continue;
      const games = schedule.get(match.matchupPeriodId) ?? [];
      games.push(match);
      schedule.set(match.matchupPeriodId, games);
    }
    for (const [week, matches] of schedule) {
      // Scores alone do not close a week: every scheduled pairing must have an
      // official winner/tie and a final score (never a live score or projection).
      const valid =
        matches.length > 0 &&
        matches.every(
          (match) =>
            isWinner(match.winner) &&
            match.home?.teamId != null &&
            match.away?.teamId != null &&
            teams.has(match.home.teamId) &&
            teams.has(match.away.teamId) &&
            finalPoints(match, "home") != null &&
            finalPoints(match, "away") != null,
        );
      if (!valid) continue;
      const games = new Map<string, Game>();
      for (const match of matches) {
        const home = teams.get(match.home!.teamId!)!;
        const away = teams.get(match.away!.teamId!)!;
        const homePoints = finalPoints(match, "home");
        const awayPoints = finalPoints(match, "away");
        if (homePoints == null || awayPoints == null || !isWinner(match.winner)) continue;
        const game: Game = {
          season: season.seasonId,
          week,
          playoff: Boolean(match.playoffTierType && match.playoffTierType !== "NONE"),
          homeId: home.id!,
          awayId: away.id!,
          homeTeam: helpers.teamName(home),
          awayTeam: helpers.teamName(away),
          homeOwnerIds: [...new Set(home.owners ?? [])].sort(),
          awayOwnerIds: [...new Set(away.owners ?? [])].sort(),
          homeManagers: helpers.teamManagers(season, home).map(keyOf),
          awayManagers: helpers.teamManagers(season, away).map(keyOf),
          homePoints,
          awayPoints,
          winner: match.winner,
        };
        const identity = matchupIdentityKey(game);
        if (!games.has(identity)) games.set(identity, game);
      }
      if (games.size) result.push({ season: season.seasonId, week, games: [...games.values()] });
    }
  }
  return result.sort((a, b) => a.season - b.season || a.week - b.week);
}

function managerGames(games: Game[], key: string) {
  return dedupeMatchups(
    games.filter((game) => game.homeManagers.includes(key) || game.awayManagers.includes(key)),
  );
}
function winValue(game: Game, key: string) {
  if (game.winner === "TIE") return 0.5;
  const home = game.homeManagers.includes(key);
  return (home && game.winner === "HOME") || (!home && game.winner === "AWAY") ? 1 : 0;
}
function totals(games: Game[], key: string) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let points = 0;
  for (const game of games) {
    const home = game.homeManagers.includes(key);
    const own = home ? game.homePoints : game.awayPoints;
    const opponent = home ? game.awayPoints : game.homePoints;
    points += own;
    if (own === opponent) ties++;
    else if (winValue(game, key) === 1) wins++;
    else losses++;
  }
  return { wins, losses, ties, points };
}
function latestStreak(games: Game[], key: string) {
  let type: "win" | "loss" | "tie" | null = null;
  let count = 0;
  for (const game of games) {
    const outcome = game.winner === "TIE" ? "tie" : winValue(game, key) === 1 ? "win" : "loss";
    if (outcome === type) count++;
    else {
      type = outcome;
      count = 1;
    }
  }
  return { type, count };
}
function makeChapter(
  key: string,
  section: Exclude<StorySection, null>,
  season: number,
  week: number,
  eventKey: string,
  title: string,
  content: string,
): ManagerStoryEntry {
  return {
    manager_key: key,
    entry_type: "chapter",
    section,
    season,
    week,
    event_key: eventKey,
    title,
    content,
  };
}

function titleSummary(years: number[], throughSeason = Number.POSITIVE_INFINITY) {
  const confirmed = years.filter((year) => year <= throughSeason);
  return confirmed.length
    ? "Finalized playoff records confirm championship season(s): " + confirmed.join(", ") + "."
    : "No championship is confirmed in the available finalized playoff records.";
}

function confirmedTitleYears(key: string, seasons: RawSeason[], weeks: Week[], helpers: Helpers) {
  return seasons.flatMap((season) => {
    if (season.seasonId == null) return [];
    const playoffPeriods = [
      ...new Set(
        (season.schedule ?? [])
          .filter((match) => match.playoffTierType && match.playoffTierType !== "NONE")
          .map((match) => match.matchupPeriodId)
          .filter((week): week is number => week != null && week > 0),
      ),
    ];
    const completePlayoffs =
      playoffPeriods.length > 0 &&
      playoffPeriods.every((period) =>
        weeks.some((week) => week.season === season.seasonId && week.week === period),
      );
    if (!completePlayoffs) return [];
    return (season.teams ?? []).some(
      (team) =>
        team.rankCalculatedFinal === 1 &&
        helpers.teamManagers(season, team).some((manager) => keyOf(manager) === key),
    )
      ? [season.seasonId]
      : [];
  });
}

function buildEntries(
  key: string,
  name: string,
  seasons: RawSeason[],
  existing: ManagerStoryEntry[],
  helpers: Helpers,
) {
  const weeks = completedWeeks(seasons, helpers);
  const activeSeason = Math.max(0, ...seasons.map((season) => season.seasonId ?? 0));
  const allGames = weeks.flatMap((week) => week.games);
  const managerAllGames = managerGames(allGames, key);
  const titleYears = confirmedTitleYears(key, seasons, weeks, helpers);
  const processed = new Set(
    existing
      .filter((entry) => entry.entry_type === "week_evaluation")
      .map((entry) => entry.event_key),
  );
  const keys = new Set(existing.map((entry) => entry.event_key));
  const additions: ManagerStoryEntry[] = [];
  const chapters = new Set(
    existing.filter((entry) => entry.entry_type === "chapter").map((entry) => entry.event_key),
  );
  const lastSummary = (type: StoryType, season?: number) =>
    existing
      .filter((entry) => entry.entry_type === type && (season == null || entry.season === season))
      .sort((a, b) => b.season - a.season || b.week - a.week)[0] ?? null;
  let careerSummary = lastSummary("career_summary");
  const latestCurrent = new Map<number, ManagerStoryEntry>();
  for (const entry of existing) {
    if (entry.entry_type !== "current_season_summary") continue;
    const prev = latestCurrent.get(entry.season);
    if (!prev || entry.week > prev.week) latestCurrent.set(entry.season, entry);
  }

  if (
    !existing.some(
      (entry) => entry.entry_type === "chapter" && entry.section === "career_foundation",
    ) &&
    managerAllGames.length
  ) {
    const career = totals(managerAllGames, key);
    const years = [...new Set(managerAllGames.map((game) => game.season))].sort((a, b) => a - b);
    additions.push(
      makeChapter(
        key,
        "career_foundation",
        years[0] ?? 0,
        0,
        "career-foundation:v1",
        "Career Foundation",
        name +
          "'s available archive spans " +
          years.length +
          " season(s) and " +
          managerAllGames.length +
          " finalized matchups. The verified career record is " +
          career.wins +
          "-" +
          career.losses +
          (career.ties ? "-" + career.ties : "") +
          ", with " +
          show(career.points) +
          " points scored. " +
          titleSummary(titleYears),
      ),
    );
  }
  if (!careerSummary && managerAllGames.length) {
    const career = totals(managerAllGames, key);
    const latestGame = managerAllGames[managerAllGames.length - 1]!;
    const content =
      name +
      "'s verified career record is " +
      career.wins +
      "-" +
      career.losses +
      (career.ties ? "-" + career.ties : "") +
      " across " +
      managerAllGames.length +
      " completed matchups and " +
      new Set(managerAllGames.map((game) => game.season)).size +
      " season(s), with " +
      show(career.points) +
      " points scored. " +
      titleSummary(titleYears);
    const entry: ManagerStoryEntry = {
      manager_key: key,
      entry_type: "career_summary",
      section: null,
      season: latestGame.season,
      week: latestGame.week,
      event_key: "career-summary:archive",
      title: null,
      content,
    };
    additions.push(entry);
    careerSummary = entry;
    keys.add(entry.event_key);
  }

  for (const week of weeks) {
    const evaluationKey = "evaluation:" + week.season + ":" + week.week;
    const weekManagerGames = managerGames(week.games, key);
    if (!weekManagerGames.length || processed.has(evaluationKey)) continue;
    const through = managerGames(
      allGames.filter(
        (game) =>
          game.season < week.season || (game.season === week.season && game.week <= week.week),
      ),
      key,
    );
    const before = managerGames(
      allGames.filter(
        (game) =>
          game.season < week.season || (game.season === week.season && game.week < week.week),
      ),
      key,
    );
    const seasonThrough = through.filter((game) => game.season === week.season);
    const seasonRecord = totals(seasonThrough, key);
    const latestGame = weekManagerGames[weekManagerGames.length - 1]!;
    const isHome = latestGame.homeManagers.includes(key);
    const ownPoints = isHome ? latestGame.homePoints : latestGame.awayPoints;
    const opponentPoints = isHome ? latestGame.awayPoints : latestGame.homePoints;
    const opponentName = isHome ? latestGame.awayTeam : latestGame.homeTeam;
    const resultText =
      ownPoints === opponentPoints
        ? "tied " + opponentName + " " + show(ownPoints) + "–" + show(opponentPoints)
        : winValue(latestGame, key) === 1
          ? "beat " + opponentName + " " + show(ownPoints) + "–" + show(opponentPoints)
          : "fell to " + opponentName + " " + show(ownPoints) + "–" + show(opponentPoints);
    const currentText =
      "Through Week " +
      week.week +
      " of " +
      week.season +
      ", " +
      name +
      " is " +
      seasonRecord.wins +
      "-" +
      seasonRecord.losses +
      (seasonRecord.ties ? "-" + seasonRecord.ties : "") +
      " across " +
      seasonThrough.length +
      " finalized matchup(s), with " +
      show(seasonRecord.points) +
      " points scored. The latest result: " +
      resultText +
      ".";
    const currentKey = "current-season:" + week.season + ":" + week.week;
    const prevCurrent = latestCurrent.get(week.season);
    if (
      week.season === activeSeason &&
      prevCurrent?.content !== currentText &&
      !keys.has(currentKey)
    ) {
      const entry: ManagerStoryEntry = {
        manager_key: key,
        entry_type: "current_season_summary",
        section: null,
        season: week.season,
        week: week.week,
        event_key: currentKey,
        title: null,
        content: currentText,
      };
      additions.push(entry);
      latestCurrent.set(week.season, entry);
      keys.add(currentKey);
    }

    const moments: ManagerStoryEntry[] = [];
    const previousOwnScores = before.map((game) =>
      game.homeManagers.includes(key) ? game.homePoints : game.awayPoints,
    );
    const highBefore = Math.max(0, ...previousOwnScores);
    for (const game of weekManagerGames) {
      const home = game.homeManagers.includes(key);
      const points = home ? game.homePoints : game.awayPoints;
      const opponentPoints = home ? game.awayPoints : game.homePoints;
      const opponent = home ? game.awayTeam : game.homeTeam;
      const teamId = home ? game.homeId : game.awayId;
      if (before.length >= 4 && points > highBefore) {
        moments.push(
          makeChapter(
            key,
            "defining_moment",
            week.season,
            week.week,
            "career-high:" + week.season + ":" + week.week + ":" + teamId,
            "A New Career High",
            "In Week " +
              week.week +
              " of " +
              week.season +
              ", " +
              name +
              " set a verified career scoring high with " +
              show(points) +
              " points against " +
              opponent +
              ", surpassing the previous high of " +
              show(highBefore) +
              ". The matchup ended " +
              show(points) +
              "–" +
              show(opponentPoints) +
              ".",
          ),
        );
      }

      if (
        game.playoff &&
        winValue(game, key) === 1 &&
        before.filter((item) => item.playoff && winValue(item, key) === 1).length === 0
      ) {
        moments.push(
          makeChapter(
            key,
            "defining_moment",
            week.season,
            week.week,
            "first-playoff-win:" + week.season + ":" + week.week + ":" + teamId,
            "First Postseason Victory",
            name +
              " earned a first recorded postseason victory in Week " +
              week.week +
              " of " +
              week.season +
              ", defeating " +
              opponent +
              " " +
              show(points) +
              "–" +
              show(opponentPoints) +
              ".",
          ),
        );
      }

      const team = (seasons.find((item) => item.seasonId === week.season)?.teams ?? []).find(
        (item) => item.id === teamId,
      );
      const playoffWeeks = weeks.filter(
        (item) => item.season === week.season && item.games.some((candidate) => candidate.playoff),
      );
      const finalPlayoffWeek = Math.max(0, ...playoffWeeks.map((item) => item.week));
      if (game.playoff && team?.rankCalculatedFinal === 1 && week.week === finalPlayoffWeek) {
        moments.push(
          makeChapter(
            key,
            "defining_moment",
            week.season,
            week.week,
            "championship:" + week.season + ":" + teamId,
            "A Championship Season",
            "The finalized " +
              week.season +
              " standings confirm " +
              name +
              " as champion. The title arrived after a verified postseason victory over " +
              opponent +
              " in Week " +
              week.week +
              ".",
          ),
        );
      }
    }

    const priorTotals = totals(before, key);
    const currentTotals = totals(through, key);
    for (const milestone of [10, 25, 50, 100]) {
      if (priorTotals.wins < milestone && currentTotals.wins >= milestone) {
        moments.push(
          makeChapter(
            key,
            "defining_moment",
            week.season,
            week.week,
            "career-wins:" + milestone,
            milestone + " Career Wins",
            name +
              " reached " +
              milestone +
              " finalized career wins in Week " +
              week.week +
              " of " +
              week.season +
              ". The documented record now stands at " +
              currentTotals.wins +
              "-" +
              currentTotals.losses +
              (currentTotals.ties ? "-" + currentTotals.ties : "") +
              ".",
          ),
        );
      }
    }

    const oldStreak = latestStreak(before, key);
    const newStreak = latestStreak(through, key);
    const streakMarks =
      newStreak.type === "loss" ? [3, 5, 8] : newStreak.type === "win" ? [5, 10] : [];
    for (const mark of streakMarks) {
      if (
        newStreak.count >= mark &&
        (oldStreak.type !== newStreak.type || oldStreak.count < mark)
      ) {
        const label = newStreak.type === "loss" ? "Game Losing Streak" : "Game Winning Streak";
        moments.push(
          makeChapter(
            key,
            "defining_moment",
            week.season,
            week.week,
            "streak:" + newStreak.type + ":" + week.season + ":" + week.week + ":" + mark,
            mark + "-Game " + label,
            name +
              " reached " +
              mark +
              " consecutive " +
              newStreak.type +
              "s through Week " +
              week.week +
              " of " +
              week.season +
              ". The run is measured only across finalized matchups.",
          ),
        );
      }
    }

    const rivalryTotals = new Map<
      string,
      {
        rival: string;
        ownerIds: string[];
        wins: number;
        losses: number;
        ties: number;
        games: number;
      }
    >();
    const priorRivalry = new Map<
      string,
      {
        rival: string;
        ownerIds: string[];
        wins: number;
        losses: number;
        ties: number;
        games: number;
      }
    >();
    const addRival = (
      map: Map<
        string,
        {
          rival: string;
          ownerIds: string[];
          wins: number;
          losses: number;
          ties: number;
          games: number;
        }
      >,
      game: Game,
    ) => {
      const home = game.homeManagers.includes(key);
      const rival = (home ? game.awayManagers : game.homeManagers).join(" & ");
      const ownerIds = home ? game.awayOwnerIds : game.homeOwnerIds;
      if (!rival || !ownerIds.length) return;
      const identity = JSON.stringify([...new Set(ownerIds)].sort());
      const stats = map.get(identity) ?? { rival, ownerIds, wins: 0, losses: 0, ties: 0, games: 0 };
      stats.rival = rival;
      if (game.winner === "TIE") stats.ties = (stats.ties ?? 0) + 1;
      else if (winValue(game, key) === 1) stats.wins++;
      else stats.losses++;
      stats.games = (stats.games ?? 0) + 1;
      map.set(identity, stats);
    };
    for (const game of through) addRival(rivalryTotals, game);
    for (const game of before) addRival(priorRivalry, game);
    for (const [identity, stats] of rivalryTotals) {
      const previous = priorRivalry.get(identity) ?? {
        rival: stats.rival,
        ownerIds: stats.ownerIds,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
      };
      const oldLead = previous.wins - previous.losses;
      const newLead = stats.wins - stats.losses;
      if (
        (stats.games ?? 0) >= 5 &&
        Math.abs(newLead) >= 3 &&
        Math.sign(oldLead) !== Math.sign(newLead)
      ) {
        moments.push(
          makeChapter(
            key,
            "rivalry",
            week.season,
            week.week,
            rivalryEventKey(week.season, week.week, stats.ownerIds),
            "The " + stats.rival + " Rivalry Turns",
            "After " +
              stats.games +
              " finalized head-to-head matchups, " +
              name +
              " moved to a " +
              stats.wins +
              "-" +
              stats.losses +
              ((stats.ties ?? 0) ? "-" + stats.ties : "") +
              " lead over " +
              stats.rival +
              ". The latest meeting was in Week " +
              week.week +
              " of " +
              week.season +
              ".",
          ),
        );
      }
    }

    let significant = false;
    for (const moment of moments) {
      if (chapters.has(moment.event_key)) continue;
      additions.push(moment);
      chapters.add(moment.event_key);
      significant = true;
    }
    if (!careerSummary || significant) {
      const career = totals(through, key);
      const content =
        name +
        "'s verified career record is " +
        career.wins +
        "-" +
        career.losses +
        (career.ties ? "-" + career.ties : "") +
        " across " +
        through.length +
        " completed matchups and " +
        new Set(through.map((game) => game.season)).size +
        " season(s), with " +
        show(career.points) +
        " points scored. " +
        titleSummary(titleYears, week.season);
      if (!careerSummary || careerSummary.content !== content) {
        const eventKey = "career-summary:" + week.season + ":" + week.week;
        if (!keys.has(eventKey)) {
          careerSummary = {
            manager_key: key,
            entry_type: "career_summary",
            section: null,
            season: week.season,
            week: week.week,
            event_key: eventKey,
            title: null,
            content,
          };
          additions.push(careerSummary);
          keys.add(eventKey);
        }
      }
    }

    additions.push({
      manager_key: key,
      entry_type: "week_evaluation",
      section: null,
      season: week.season,
      week: week.week,
      event_key: evaluationKey,
      title: null,
      content: "",
    });
    processed.add(evaluationKey);
  }
  return { weeks, additions };
}

export function buildManagerStory(
  keyInput: string,
  name: string,
  seasons: RawSeason[],
  existing: ManagerStoryEntry[],
  helpers: Helpers,
): { story: ManagerStory; additions: ManagerStoryEntry[] } {
  const key = keyOf(keyInput);
  const { weeks, additions } = buildEntries(key, name, seasons, existing, helpers);
  const activeSeason = Math.max(0, ...seasons.map((season) => season.seasonId ?? 0));
  const all = [...existing, ...additions];
  const order = (a: ManagerStoryEntry, b: ManagerStoryEntry) =>
    a.season - b.season ||
    a.week - b.week ||
    (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
    a.event_key.localeCompare(b.event_key);
  const chapters = all.filter((entry) => entry.entry_type === "chapter").sort(order);
  const careerVersions = all.filter((entry) => entry.entry_type === "career_summary").sort(order);
  const currentVersions = all
    .filter((entry) => entry.entry_type === "current_season_summary")
    .sort(order);
  const currentSeasonVersion =
    currentVersions.filter((entry) => entry.season === activeSeason).at(-1) ?? null;
  const rivals = new Map<string, ManagerRivalry>();
  for (const game of weeks.flatMap((week) => week.games)) {
    const home = game.homeManagers.includes(key);
    const away = game.awayManagers.includes(key);
    if (!home && !away) continue;
    const opponent = (home ? game.awayManagers : game.homeManagers).join(" & ");
    if (!opponent) continue;
    const item = rivals.get(opponent) ?? {
      opponent,
      wins: 0,
      losses: 0,
      ties: 0,
      games: 0,
      latest: "",
    };
    item.games++;
    if (game.winner === "TIE") item.ties++;
    else if (winValue(game, key) === 1) item.wins++;
    else item.losses++;
    item.latest = game.season + " · Week " + game.week;
    rivals.set(opponent, item);
  }
  return {
    additions,
    story: {
      available: true,
      careerSummary: careerVersions.at(-1) ?? null,
      careerSummaryHistory: careerVersions.slice(0, -1).reverse(),
      currentSeasonSummary: currentSeasonVersion,
      currentSeasonHistory: currentVersions
        .filter((entry) => entry.event_key !== currentSeasonVersion?.event_key)
        .reverse(),
      careerFoundation: chapters.find((entry) => entry.section === "career_foundation") ?? null,
      definingMoments: chapters.filter((entry) => entry.section === "defining_moment").reverse(),
      rivalryChapters: chapters.filter((entry) => entry.section === "rivalry").reverse(),
      rivalries: [...rivals.values()]
        .filter((item) => item.games >= 2)
        .sort(
          (a, b) => b.games - a.games || Math.abs(b.wins - b.losses) - Math.abs(a.wins - a.losses),
        ),
      latestChapter: chapters.at(-1) ?? null,
    },
  };
}
