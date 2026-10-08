import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TeamStats = {
  teamId: number;
  team: string;
  managers: string;
  pointsFor: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  expectedWins: number;
  lowWeeks: number;
  lossMargin: number;
  lossCount: number;
  luckyWins: number;
  unluckyLosses: number;
  lossStreak: number;
  recentDecline: number | null;
  benchPoints: number;
  benchWeeks: number;
  weeklyScores: number[];
};

const rounded = (n: number, digits = 1) => Number(n.toFixed(digits));

function percentile(values: number[], value: number) {
  if (values.length < 2) return 0.5;
  const below = values.filter((x) => x < value).length;
  const tied = values.filter((x) => x === value).length;
  return (below + (tied - 1) / 2) / (values.length - 1);
}

function povertyLevel(score: number) {
  if (score < 20) return "Not Poor";
  if (score < 40) return "Struggling";
  if (score < 60) return "Poor";
  if (score < 80) return "Very Poor";
  return "Generational Poverty";
}

export const getPovertyRankings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const L = await import("./league.server");
    const { seasons, error } = await L.loadAllSeasons();
    const season =
      seasons.find((s) =>
        (s.schedule ?? []).some((m) => ["HOME", "AWAY", "TIE"].includes(m.winner ?? "")),
      ) ?? seasons[0];
    if (!season) return { error: error ?? "No league data yet.", season: null, week: 0, teams: [] };

    const teams = season.teams ?? [];
    const teamLabels = new Map(
      teams.map((t) => [
        t.id ?? 0,
        {
          team: L.teamName(t),
          managers: L.teamManagers(season, t).join(" & "),
        },
      ]),
    );
    const byWeek = new Map<number, Map<number, number>>();
    const opponentByWeek = new Map<number, Map<number, number>>();
    for (const matchup of season.schedule ?? []) {
      if (!(matchup.winner === "HOME" || matchup.winner === "AWAY" || matchup.winner === "TIE"))
        continue;
      if (matchup.playoffTierType && matchup.playoffTierType !== "NONE") continue;
      if (matchup.home?.teamId == null || matchup.away?.teamId == null) continue;
      for (const wk of L.matchWeeks(matchup)) {
        if (wk.period <= 0) continue;
        const scores = byWeek.get(wk.period) ?? new Map<number, number>();
        scores.set(matchup.home.teamId, wk.homePts);
        scores.set(matchup.away.teamId, wk.awayPts);
        byWeek.set(wk.period, scores);
        const opponents = opponentByWeek.get(wk.period) ?? new Map<number, number>();
        opponents.set(matchup.home.teamId, matchup.away.teamId);
        opponents.set(matchup.away.teamId, matchup.home.teamId);
        opponentByWeek.set(wk.period, opponents);
      }
    }
    const weeks = [...byWeek.keys()].sort((a, b) => a - b);
    const week = weeks.at(-1) ?? 0;

    // Read only the existing snapshots. No new snapshot or ESPN request is made here.
    const snapshots = season.seasonId ? await L.getWeeklySnapshots(season.seasonId) : [];
    const benchByWeek = new Map<number, Map<number, number>>();
    for (const snapshot of snapshots) {
      const snapWeek = Number(snapshot.week);
      if (!weeks.includes(snapWeek)) continue;
      const rosters = snapshot.raw_rosters as Array<{
        id?: number;
        roster?: { entries?: Array<{ playerId?: number; lineupSlotId?: number }> };
      }> | null;
      const pool = snapshot.raw_player_pool as Array<{
        player?: {
          id?: number;
          stats?: Array<{
            statSourceId?: number;
            statSplitTypeId?: number;
            scoringPeriodId?: number;
            appliedTotal?: number;
          }>;
        };
      }> | null;
      if (!rosters?.length || !pool?.length) continue;
      const playerPoints = new Map<number, number>();
      let hasWeeklyScores = false;
      for (const entry of pool) {
        const id = entry.player?.id;
        if (id == null) continue;
        const stat = entry.player?.stats?.find(
          (s) => s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId === snapWeek,
        );
        if (stat) {
          hasWeeklyScores = true;
          playerPoints.set(id, stat.appliedTotal ?? 0);
        }
      }
      if (!hasWeeklyScores) continue;
      const teamBench = new Map<number, number>();
      for (const roster of rosters) {
        if (roster.id == null) continue;
        const points = (roster.roster?.entries ?? [])
          .filter((entry) => entry.lineupSlotId === 20 && entry.playerId != null)
          .reduce((sum, entry) => sum + (playerPoints.get(entry.playerId!) ?? 0), 0);
        teamBench.set(roster.id, points);
      }
      benchByWeek.set(snapWeek, teamBench);
    }

    function calculate(throughWeek: number) {
      const scoredWeeks = weeks.filter((w) => w <= throughWeek);
      const rows: TeamStats[] = teams.map((t) => {
        const teamId = t.id ?? 0;
        let wins = 0,
          losses = 0,
          ties = 0,
          expectedWins = 0;
        let lowWeeks = 0,
          lossMargin = 0,
          lossCount = 0,
          luckyWins = 0,
          unluckyLosses = 0;
        let pointsFor = 0,
          currentLosingRun = 0;
        const weeklyScores: number[] = [];
        let benchPoints = 0,
          benchWeeks = 0;
        for (const w of scoredWeeks) {
          const scoreMap = byWeek.get(w)!;
          const mine = scoreMap.get(teamId);
          if (mine == null) continue;
          const leagueScores = [...scoreMap.values()];
          const leagueAverage =
            leagueScores.reduce((a, b) => a + b, 0) / Math.max(1, leagueScores.length);
          pointsFor += mine;
          weeklyScores.push(mine);
          if (mine < leagueAverage) lowWeeks++;
          let weeklyExpected = 0;
          for (const [opponentId, opponentScore] of scoreMap) {
            if (opponentId === teamId) continue;
            if (mine > opponentScore) weeklyExpected++;
            else if (mine === opponentScore) weeklyExpected += 0.5;
          }
          expectedWins += weeklyExpected / Math.max(1, scoreMap.size - 1);

          const opponentId = opponentByWeek.get(w)?.get(teamId);
          const opponentScore = opponentId == null ? undefined : scoreMap.get(opponentId);
          if (opponentScore != null) {
            if (mine > opponentScore) {
              wins++;
              currentLosingRun = 0;
              if (mine < leagueAverage) luckyWins++;
            } else if (mine < opponentScore) {
              losses++;
              lossCount++;
              lossMargin += opponentScore - mine;
              currentLosingRun++;
              if (mine >= leagueAverage) unluckyLosses++;
            } else {
              ties++;
              currentLosingRun = 0;
            }
          }
          const bench = benchByWeek.get(w)?.get(teamId);
          if (bench != null) {
            benchPoints += bench;
            benchWeeks++;
          }
        }
        const previous = weeklyScores.slice(-6, -3);
        const recent = weeklyScores.slice(-3);
        const recentDecline =
          previous.length >= 2 && recent.length >= 2
            ? previous.reduce((a, b) => a + b, 0) / previous.length -
              recent.reduce((a, b) => a + b, 0) / recent.length
            : null;
        return {
          teamId,
          ...(teamLabels.get(teamId) ?? { team: `Team ${teamId}`, managers: "" }),
          pointsFor,
          games: wins + losses + ties,
          wins,
          losses,
          ties,
          expectedWins,
          lowWeeks,
          lossMargin,
          lossCount,
          luckyWins,
          unluckyLosses,
          lossStreak: currentLosingRun,
          recentDecline,
          benchPoints,
          benchWeeks,
          weeklyScores,
        };
      });

      const definitions = [
        {
          key: "points",
          weight: 20,
          values: rows.map((r) => -(r.pointsFor / Math.max(1, r.games))),
          reason: (r: TeamStats) =>
            `${(r.pointsFor / Math.max(1, r.games)).toFixed(1)} points per game`,
        },
        {
          key: "record",
          weight: 15,
          values: rows.map((r) => -((r.wins + r.ties * 0.5) / Math.max(1, r.games))),
          reason: (r: TeamStats) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""} record`,
        },
        {
          key: "lowWeeks",
          weight: 10,
          values: rows.map((r) => r.lowWeeks / Math.max(1, r.games)),
          reason: (r: TeamStats) =>
            `${r.lowWeeks} below-average scoring week${r.lowWeeks === 1 ? "" : "s"}`,
        },
        {
          key: "streak",
          weight: 10,
          values: rows.map((r) => r.lossStreak),
          reason: (r: TeamStats) => `${r.lossStreak}-game current losing streak`,
        },
        {
          key: "margin",
          weight: 10,
          values: rows.map((r) => (r.lossCount ? r.lossMargin / r.lossCount : 0)),
          reason: (r: TeamStats) =>
            r.lossCount
              ? `${(r.lossMargin / r.lossCount).toFixed(1)}-point average loss`
              : "no losses yet",
        },
        {
          key: "expected",
          weight: 10,
          values: rows.map((r) =>
            r.games ? r.expectedWins / Math.max(1, r.games) - (r.wins + r.ties * 0.5) / r.games : 0,
          ),
          reason: (r: TeamStats) =>
            `${(r.expectedWins / Math.max(1, r.games)).toFixed(1)} expected wins vs ${r.wins + r.ties * 0.5} actual`,
        },
        {
          key: "luck",
          weight: 10,
          values: rows.map(
            (r) => r.unluckyLosses / Math.max(1, r.losses) - r.luckyWins / Math.max(1, r.wins),
          ),
          reason: (r: TeamStats) =>
            `${r.unluckyLosses} unlucky loss${r.unluckyLosses === 1 ? "" : "es"}, ${r.luckyWins} lucky win${r.luckyWins === 1 ? "" : "s"}`,
        },
        {
          key: "bench",
          weight: 5,
          values: rows.map((r) => (r.benchWeeks ? r.benchPoints / r.benchWeeks : 0)),
          reason: (r: TeamStats) =>
            r.benchWeeks
              ? `${r.benchPoints.toFixed(1)} points left on the bench`
              : "bench history unavailable",
        },
        {
          key: "decline",
          weight: 10,
          values: rows.map((r) => r.recentDecline ?? 0),
          reason: (r: TeamStats) =>
            r.recentDecline == null
              ? "not enough weeks to measure a slump"
              : r.recentDecline > 0
                ? `scoring down ${r.recentDecline.toFixed(1)} points vs the prior three weeks`
                : `scoring up ${Math.abs(r.recentDecline).toFixed(1)} points vs the prior three weeks`,
        },
      ];
      const benchAvailable = rows.some((r) => r.benchWeeks > 0);
      const declineAvailable = rows.some((r) => r.recentDecline != null);
      const active = definitions.filter(
        (d) => (d.key !== "bench" || benchAvailable) && (d.key !== "decline" || declineAvailable),
      );
      return rows.map((row, rowIndex) => {
        const eligible = active.filter(
          (d) =>
            (d.key !== "bench" || row.benchWeeks > 0) &&
            (d.key !== "decline" || row.recentDecline != null),
        );
        const factors = eligible.map((d) => {
          const values =
            d.key === "bench"
              ? rows.filter((r) => r.benchWeeks > 0).map((r) => r.benchPoints / r.benchWeeks)
              : d.values;
          return {
            weight: d.weight,
            value: percentile(values, d.values[rowIndex]!),
            reason: d.reason(row),
          };
        });
        const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
        const score = Math.round(
          (factors.reduce((sum, f) => sum + f.value * f.weight, 0) / Math.max(1, totalWeight)) *
            100,
        );
        const explanation = [...factors]
          .sort((a, b) => b.value * b.weight - a.value * a.weight)
          .slice(0, 3)
          .map((f) => f.reason);
        return { ...row, score, level: povertyLevel(score), explanation };
      });
    }

    const current = calculate(week);
    const previous = week > 1 ? calculate(week - 1) : [];
    const previousScore = new Map(previous.map((r) => [r.teamId, r.score]));
    const ranked = current
      .map((row) => {
        const before = previousScore.get(row.teamId);
        const change = before == null ? null : row.score - before;
        return { ...row, change };
      })
      .sort((a, b) => b.score - a.score || a.team.localeCompare(b.team))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      error: null as string | null,
      season: season.seasonId ?? null,
      week,
      benchWeeksAvailable: benchByWeek.size,
      teams: ranked.map((row) => ({
        ...row,
        pointsFor: rounded(row.pointsFor),
        expectedWins: rounded(row.expectedWins, 2),
        lossMargin: rounded(row.lossMargin),
        benchPoints: rounded(row.benchPoints),
        recentDecline: row.recentDecline == null ? null : rounded(row.recentDecline),
      })),
    };
  });
