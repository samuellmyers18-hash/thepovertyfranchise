import type { RawMatch, RawSeason, RawTeam } from "./league.server";

type Helpers = {
  teamManagers: (season: RawSeason, team: RawTeam) => string[];
  matchWeeks: (match: RawMatch) => Array<{ period: number; homePts: number; awayPts: number }>;
};

type WeeklyGame = {
  week: number;
  points: number;
  opponentPoints: number;
  opponentKeys: string[];
  won: boolean;
  tied: boolean;
  playoff: boolean;
  allPlay: number | null;
  allPlayRank: number | null;
};

type TeamSeason = {
  season: number;
  teamId: number;
  managers: string[];
  games: WeeklyGame[];
  transactionRate: number | null;
  benchShare: number | null;
  rosterRetention: number | null;
  slumpRetention: number | null;
  waiverProduction: number | null;
  tradeProduction: number | null;
  rivalDeviation: number | null;
  snapshotWeeks: number;
  benchWeeks: number;
  rosterTransitions: number;
  slumpOpportunities: number;
  waiverPlayerWeeks: number;
  tradePlayerWeeks: number;
};

type Snapshot = {
  season: number;
  week: number;
  raw_rosters: unknown;
  raw_player_pool: unknown;
};

export type ManagerDNATrait = {
  name: string;
  score: number | null;
  basis: string;
  sample: number;
};

export type ManagerDNA = {
  ovr: number;
  previousOvr: number | null;
  ovrChange: number | null;
  archetype: string;
  explanation: string;
  traits: ManagerDNATrait[];
  sampleGames: number;
  sampleSeasons: number;
  snapshotWeeks: number;
};

const names = [
  "Risk",
  "Aggression",
  "Loyalty",
  "Start/Sit IQ",
  "Waiver IQ",
  "Trade Instinct",
  "Patience",
  "Volatility",
  "Clutch",
  "Consistency",
  "Pettiness",
  "Chaos",
  "Luck",
] as const;

type TraitName = (typeof names)[number];
type Metrics = Partial<Record<TraitName, number | null>> & {
  allPlayWinRate: number | null;
  actualWinRate: number | null;
  pointsPerGame: number | null;
  rivalGames: number;
  games: number;
  snapshots: number;
};

const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function percentile(
  values: Array<number | null>,
  value: number | null,
  higherIsBetter = true,
): number | null {
  const valid = values.filter((n): n is number => n != null && Number.isFinite(n));
  // A league-relative score needs at least two comparable team-seasons.
  if (value == null || valid.length < 2) return null;
  const below = valid.filter((n) => n < value).length;
  const tied = valid.filter((n) => n === value).length;
  const rank = (below + (tied - 1) / 2) / Math.max(1, valid.length - 1);
  return clamp((higherIsBetter ? rank : 1 - rank) * 100);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = average(values) ?? 0;
  return Math.sqrt(average(values.map((n) => (n - mean) ** 2)) ?? 0);
}

function addSnapshotMetrics(rows: TeamSeason[], snapshots: Snapshot[]) {
  const byKey = new Map(rows.map((row) => [`${row.season}:${row.teamId}`, row]));
  const rosterWeeks = new Map<string, Array<{ week: number; ids: Set<number> }>>();
  const playerWeeks: Array<{ key: string; playerId: number; week: number; points: number }> = [];
  const teamBenchShares = new Map<string, number[]>();
  const waiverPoints = new Map<string, number[]>();
  const tradePoints = new Map<string, number[]>();

  for (const snapshot of snapshots) {
    const rosters = snapshot.raw_rosters as Array<{
      id?: number;
      roster?: {
        entries?: Array<{ playerId?: number; lineupSlotId?: number; acquisitionType?: string }>;
      };
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

    const pointsByPlayer = new Map<number, number>();
    for (const entry of pool) {
      const id = entry.player?.id;
      if (id == null) continue;
      const stat = entry.player?.stats?.find(
        (item) =>
          item.statSourceId === 0 &&
          item.statSplitTypeId === 1 &&
          item.scoringPeriodId === snapshot.week,
      );
      if (stat) pointsByPlayer.set(id, stat.appliedTotal ?? 0);
    }
    if (!pointsByPlayer.size) continue;

    for (const roster of rosters) {
      if (roster.id == null) continue;
      const id = `${snapshot.season}:${roster.id}`;
      if (!byKey.has(id)) continue;
      const entries = roster.roster?.entries ?? [];
      const playerIds = new Set(
        entries.flatMap((entry) => (entry.playerId == null ? [] : [entry.playerId])),
      );
      const weeks = rosterWeeks.get(id) ?? [];
      weeks.push({ week: snapshot.week, ids: playerIds });
      rosterWeeks.set(id, weeks);

      let rosterPoints = 0;
      let benchPoints = 0;
      for (const entry of entries) {
        const playerId = entry.playerId;
        if (playerId == null) continue;
        const points = pointsByPlayer.get(playerId);
        if (points == null) continue;
        rosterPoints += points;
        if (entry.lineupSlotId === 20) benchPoints += points;
        playerWeeks.push({ key: id, playerId, week: snapshot.week, points });
        const acquisitionType = (entry.acquisitionType ?? "").toUpperCase();
        if (acquisitionType.includes("WAIVER") || acquisitionType.includes("FREEAGENT")) {
          const values = waiverPoints.get(id) ?? [];
          values.push(points);
          waiverPoints.set(id, values);
        }
        if (acquisitionType.includes("TRADE")) {
          const values = tradePoints.get(id) ?? [];
          values.push(points);
          tradePoints.set(id, values);
        }
      }
      if (rosterPoints > 0) {
        const values = teamBenchShares.get(id) ?? [];
        values.push(Math.max(0, Math.min(1, benchPoints / rosterPoints)));
        teamBenchShares.set(id, values);
      }
    }
  }

  for (const [id, row] of byKey) {
    const weeks = (rosterWeeks.get(id) ?? []).sort((a, b) => a.week - b.week);
    const retentions: number[] = [];
    for (let i = 1; i < weeks.length; i++) {
      const previous = weeks[i - 1]!;
      const current = weeks[i]!;
      if (current.week !== previous.week + 1 || !previous.ids.size) continue;
      const retained = [...previous.ids].filter((playerId) => current.ids.has(playerId)).length;
      retentions.push(retained / previous.ids.size);
    }
    row.benchShare = average(teamBenchShares.get(id) ?? []);
    row.benchWeeks = (teamBenchShares.get(id) ?? []).length;
    row.rosterRetention = average(retentions);
    row.rosterTransitions = retentions.length;
    row.waiverProduction = average(waiverPoints.get(id) ?? []);
    row.waiverPlayerWeeks = (waiverPoints.get(id) ?? []).length;
    row.tradeProduction = average(tradePoints.get(id) ?? []);
    row.tradePlayerWeeks = (tradePoints.get(id) ?? []).length;
    const patience = slumpRetentionFor(id, playerWeeks, weeks);
    row.slumpRetention = patience.retention;
    row.slumpOpportunities = patience.sample;
    row.snapshotWeeks = weeks.length;
  }
}

function slumpRetentionFor(
  teamSeasonKey: string,
  playerWeeks: Array<{ key: string; playerId: number; week: number; points: number }>,
  rosterWeeks: Array<{ week: number; ids: Set<number> }>,
) {
  const byPlayer = new Map<number, Array<{ week: number; points: number }>>();
  for (const item of playerWeeks) {
    if (item.key !== teamSeasonKey) continue;
    const entries = byPlayer.get(item.playerId) ?? [];
    entries.push({ week: item.week, points: item.points });
    byPlayer.set(item.playerId, entries);
  }

  let slumpWeeks = 0;
  let retained = 0;
  for (const [playerId, entries] of byPlayer.entries()) {
    entries.sort((a, b) => a.week - b.week);
    if (entries.length < 3) continue;
    const ordered = entries.map((item) => item.points).sort((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)]!;
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i]!;
      if (current.points >= median) continue;
      const nextRoster = rosterWeeks.find((week) => week.week === current.week + 1);
      if (!nextRoster) continue;
      slumpWeeks++;
      if (nextRoster?.ids.has(playerId)) retained++;
    }
  }
  return { retention: slumpWeeks ? retained / slumpWeeks : null, sample: slumpWeeks };
}

function rawMetrics(row: TeamSeason): Metrics {
  const regular = row.games.filter((game) => !game.playoff);
  const actualWins = regular.reduce((sum, game) => sum + (game.won ? 1 : game.tied ? 0.5 : 0), 0);
  const allPlayWins = regular.reduce((sum, game) => sum + (game.allPlay ?? 0.5), 0);
  const points = regular.map((game) => game.points);
  const normalized = regular.flatMap((game) => {
    const leagueAverage =
      game.allPlayRank == null
        ? null
        : (game as WeeklyGame & { leagueAverage?: number }).leagueAverage;
    return leagueAverage && leagueAverage > 0 ? [game.points / leagueAverage] : [];
  });
  const outcomeSurprises = regular.flatMap((game) =>
    game.allPlay == null ? [] : [Math.abs((game.won ? 1 : game.tied ? 0.5 : 0) - game.allPlay)],
  );
  const allPlayRanks = regular.flatMap((game) =>
    game.allPlayRank == null ? [] : [game.allPlayRank],
  );
  const late = row.games.filter((game) => game.playoff || game.week >= 13);
  const clutchGames = late.length;
  const clutchWins = late.reduce((sum, game) => sum + (game.won ? 1 : game.tied ? 0.5 : 0), 0);

  const rivals = new Map<string, { wins: number; games: number }>();
  for (const game of regular) {
    for (const rival of game.opponentKeys) {
      const record = rivals.get(rival) ?? { wins: 0, games: 0 };
      record.games++;
      record.wins += game.won ? 1 : game.tied ? 0.5 : 0;
      rivals.set(rival, record);
    }
  }
  const overallWinRate = regular.length ? actualWins / regular.length : null;
  const rivalRecords = [...rivals.values()];
  const rivalGames = rivalRecords.reduce((sum, record) => sum + record.games, 0);
  const rivalDeviation =
    overallWinRate == null ||
    rivalGames < 8 ||
    rivalRecords.filter((record) => record.games >= 3).length < 2
      ? null
      : Math.max(
          0,
          ...rivalRecords
            .filter((record) => record.games >= 3)
            .map((record) => Math.abs(record.wins / record.games - overallWinRate)),
        );
  const normalizedSwing = standardDeviation(normalized);
  const rankSwing = standardDeviation(allPlayRanks);
  const outcomeSurprise = average(outcomeSurprises);

  return {
    Risk:
      normalized.length >= 4 && normalizedSwing != null
        ? normalizedSwing + (row.transactionRate ?? 0) * 0.25
        : null,
    Aggression: regular.length >= 4 ? row.transactionRate : null,
    Loyalty: row.rosterTransitions >= 4 ? row.rosterRetention : null,
    "Start/Sit IQ": row.benchWeeks >= 4 && row.benchShare != null ? 1 - row.benchShare : null,
    "Waiver IQ": row.waiverPlayerWeeks >= 3 ? row.waiverProduction : null,
    "Trade Instinct": row.tradePlayerWeeks >= 3 ? row.tradeProduction : null,
    Patience: row.slumpOpportunities >= 3 ? row.slumpRetention : null,
    Volatility: normalized.length >= 4 ? normalizedSwing : null,
    Clutch: clutchGames >= 3 ? clutchWins / clutchGames : null,
    Consistency: normalized.length >= 4 ? normalizedSwing : null,
    Pettiness: rivalDeviation,
    Chaos:
      regular.length < 4 || rankSwing == null || outcomeSurprise == null
        ? null
        : rankSwing + outcomeSurprise,
    Luck:
      regular.length < 4 || overallWinRate == null
        ? null
        : overallWinRate - allPlayWins / regular.length,
    allPlayWinRate: regular.length >= 4 ? allPlayWins / regular.length : null,
    actualWinRate: regular.length >= 4 ? overallWinRate : null,
    pointsPerGame: regular.length >= 4 ? average(points) : null,
    rivalGames,
    games: row.games.length,
    snapshots: row.snapshotWeeks,
  };
}

function scoreMetrics(rows: TeamSeason[]) {
  const raw = rows.map(rawMetrics);
  const percentileFor = (key: keyof Metrics, metric: Metrics, higherIsBetter = true) =>
    percentile(
      raw.map((item) => item[key] as number | null),
      metric[key] as number | null,
      higherIsBetter,
    );
  const scored = raw.map((metric) => {
    const p = (key: TraitName, higherIsBetter = true) => percentileFor(key, metric, higherIsBetter);
    const weighted = (parts: Array<[number | null, number]>) => {
      const available = parts.filter((part): part is [number, number] => part[0] != null);
      const weight = available.reduce((sum, part) => sum + part[1], 0);
      return weight ? available.reduce((sum, part) => sum + part[0] * part[1], 0) / weight : null;
    };
    const trait: Record<TraitName, number | null> = {
      Risk: weighted([
        [p("Risk"), 0.5],
        [p("Aggression"), 0.5],
      ]),
      Aggression: p("Aggression"),
      Loyalty: p("Loyalty"),
      "Start/Sit IQ": p("Start/Sit IQ"),
      "Waiver IQ": p("Waiver IQ"),
      "Trade Instinct": p("Trade Instinct"),
      Patience: p("Patience"),
      Volatility: p("Volatility"),
      Clutch: p("Clutch"),
      Consistency: p("Consistency", false),
      Pettiness: p("Pettiness"),
      Chaos: p("Chaos"),
      Luck: p("Luck"),
    };
    const decision = weighted([
      [trait["Start/Sit IQ"], 0.55],
      [percentileFor("allPlayWinRate", metric), 0.2],
      [percentileFor("actualWinRate", metric), 0.15],
      [percentileFor("pointsPerGame", metric), 0.1],
    ]);
    const rosterManagement = weighted([
      [trait.Loyalty, 0.5],
      [trait.Patience, 0.5],
    ]);
    const ovr = weighted([
      [decision, 0.25],
      [rosterManagement, 0.2],
      [trait["Waiver IQ"], 0.15],
      [trait["Trade Instinct"], 0.15],
      [trait.Clutch, 0.1],
      [trait.Consistency, 0.1],
      [trait.Luck, 0.05],
    ]);
    return { trait, ovr: ovr == null ? null : clamp(ovr), metric };
  });
  return scored;
}

function chooseArchetype(scores: Record<TraitName, number>, ovr: number) {
  const combos: Array<[string, number]> = [
    ["The Chaos Merchant", (scores.Chaos + scores.Volatility + scores.Aggression) / 3],
    ["The Gambler", (scores.Risk + scores.Volatility) / 2],
    ["The Sniper", (scores["Start/Sit IQ"] + scores.Consistency) / 2],
    ["The Hoarder", (scores.Loyalty + 100 - scores.Aggression) / 2],
    [
      "The Panic Trader",
      (scores.Aggression + 100 - scores.Patience + 100 - scores["Trade Instinct"]) / 3,
    ],
    ["The Loyalist", scores.Loyalty],
    ["The Destroyer", (scores.Aggression + scores.Volatility + 100 - ovr) / 3],
    ["The Strategist", (scores["Start/Sit IQ"] + scores.Consistency + scores.Clutch + ovr) / 4],
    ["The Waiver Addict", (scores.Aggression + scores["Waiver IQ"]) / 2],
    ["The Opportunist", (scores["Waiver IQ"] + scores["Trade Instinct"] + scores.Luck) / 3],
    ["The Victim", (100 - scores.Luck + 100 - ovr) / 2],
    ["The Wild Card", (scores.Chaos + scores.Risk + scores.Volatility) / 3],
  ];
  return combos.sort((a, b) => b[1] - a[1])[0]![0];
}

function explain(scores: Record<TraitName, number>) {
  if (scores.Risk >= 70 && scores["Waiver IQ"] >= 65 && scores.Volatility >= 60) {
    return "High-risk, high-upside manager who finds production on waivers, with a volatile week-to-week ride.";
  }
  if (scores["Start/Sit IQ"] >= 70 && scores.Consistency >= 65) {
    return "Disciplined lineup manager who gets strong starts from the roster and delivers steady weekly results.";
  }
  if (scores.Aggression >= 70 && scores["Waiver IQ"] >= 65) {
    return "Active roster builder who keeps pursuing waiver options and has found useful production in those moves.";
  }
  if (scores.Loyalty >= 70 && scores.Patience >= 65) {
    return "Patient roster builder who tends to stick with players through rough patches instead of overreacting.";
  }
  const strongest = names
    .filter((name) => name !== "Luck")
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, 2);
  return `The profile leans toward ${strongest[0]!.toLowerCase()} and ${strongest[1]!.toLowerCase()}, measured against the league's available history.`;
}

export function calculateManagerDNA(
  managerKey: string,
  seasons: RawSeason[],
  snapshots: Snapshot[],
  helpers: Helpers,
): ManagerDNA {
  const rows: TeamSeason[] = [];
  for (const season of seasons) {
    const year = season.seasonId ?? 0;
    const byId = new Map<number, TeamSeason>();
    for (const team of season.teams ?? []) {
      if (team.id == null) continue;
      const managers = helpers.teamManagers(season, team).map(keyOf);
      const row: TeamSeason = {
        season: year,
        teamId: team.id,
        managers,
        games: [],
        transactionRate: null,
        benchShare: null,
        rosterRetention: null,
        slumpRetention: null,
        waiverProduction: null,
        tradeProduction: null,
        rivalDeviation: null,
        snapshotWeeks: 0,
        benchWeeks: 0,
        rosterTransitions: 0,
        slumpOpportunities: 0,
        waiverPlayerWeeks: 0,
        tradePlayerWeeks: 0,
      };
      const counters = team.transactionCounter;
      const activity = counters?.acquisitions != null || counters?.trades != null;
      row.transactionRate = activity
        ? ((counters?.acquisitions ?? 0) + (counters?.trades ?? 0)) /
          Math.max(
            1,
            (team.record?.overall?.wins ?? 0) +
              (team.record?.overall?.losses ?? 0) +
              (team.record?.overall?.ties ?? 0),
          )
        : null;
      rows.push(row);
      byId.set(team.id, row);
    }

    const pointsByWeek = new Map<number, Map<number, number>>();
    const matchRows: Array<{
      home: TeamSeason;
      away: TeamSeason;
      homePoints: number;
      awayPoints: number;
      week: number;
      playoff: boolean;
    }> = [];
    for (const match of season.schedule ?? []) {
      if (match.winner !== "HOME" && match.winner !== "AWAY" && match.winner !== "TIE") continue;
      if (match.home?.teamId == null || match.away?.teamId == null) continue;
      const home = byId.get(match.home.teamId);
      const away = byId.get(match.away.teamId);
      if (!home || !away) continue;
      for (const week of helpers.matchWeeks(match)) {
        if (week.period <= 0) continue;
        for (const [teamId, points] of [
          [home.teamId, week.homePts],
          [away.teamId, week.awayPts],
        ] as const) {
          const scores = pointsByWeek.get(week.period) ?? new Map<number, number>();
          scores.set(teamId, points);
          pointsByWeek.set(week.period, scores);
        }
        matchRows.push({
          home,
          away,
          homePoints: week.homePts,
          awayPoints: week.awayPts,
          week: week.period,
          playoff: Boolean(match.playoffTierType && match.playoffTierType !== "NONE"),
        });
      }
    }

    for (const match of matchRows) {
      const leagueScores = pointsByWeek.get(match.week) ?? new Map<number, number>();
      const league = [...leagueScores.values()];
      const leagueAverage = average(league);
      const homeWins = match.homePoints > match.awayPoints;
      const awayWins = match.awayPoints > match.homePoints;
      const homeTied = match.homePoints === match.awayPoints;
      const weekGames = [
        {
          row: match.home,
          points: match.homePoints,
          opp: match.awayPoints,
          won: homeWins,
          tied: homeTied,
          opponent: match.away,
        },
        {
          row: match.away,
          points: match.awayPoints,
          opp: match.homePoints,
          won: awayWins,
          tied: homeTied,
          opponent: match.home,
        },
      ];
      for (const game of weekGames) {
        const scores = [...leagueScores.entries()]
          .filter(([teamId]) => teamId !== game.row.teamId)
          .map(([, points]) => points);
        const allPlayCount =
          scores.filter((value) => game.points > value).length +
          scores.filter((value) => game.points === value).length / 2;
        const allPlay = scores.length ? allPlayCount / scores.length : null;
        const weeklyGame: WeeklyGame & { leagueAverage?: number } = {
          week: match.week,
          points: game.points,
          opponentPoints: game.opp,
          // Team ID keeps co-managed teams from counting as multiple separate rivals.
          opponentKeys: [String(game.opponent.teamId)],
          won: game.won,
          tied: game.tied,
          playoff: match.playoff,
          allPlay,
          allPlayRank: allPlay,
          ...(leagueAverage == null ? {} : { leagueAverage }),
        };
        game.row.games.push(weeklyGame);
      }
    }
  }

  addSnapshotMetrics(rows, snapshots);
  const scored = scoreMetrics(rows);
  const managerRows = rows.flatMap((row, index) =>
    row.managers.includes(managerKey) ? [{ row, ...scored[index]! }] : [],
  );
  const traitScores = Object.fromEntries(
    names.map((name) => [
      name,
      average(
        managerRows
          .map((item) => item.trait[name])
          .filter((score): score is number => score != null),
      ),
    ]),
  ) as Record<TraitName, number | null>;
  const ovr = clamp(
    average(
      managerRows.map((item) => item.ovr).filter((score): score is number => score != null),
    ) ?? 50,
  );
  const archetypeScores = Object.fromEntries(
    names.map((name) => [name, traitScores[name] ?? 50]),
  ) as Record<TraitName, number>;
  const bySeason = new Map<number, number[]>();
  for (const item of managerRows) {
    const list = bySeason.get(item.row.season) ?? [];
    if (item.ovr != null) list.push(item.ovr);
    bySeason.set(item.row.season, list);
  }
  const seasonOvr = [...bySeason.entries()]
    .map(([season, values]) => ({ season, ovr: clamp(average(values) ?? 50) }))
    .sort((a, b) => a.season - b.season);
  const latestSeason = seasonOvr.at(-1)?.season;
  const priorSeasons = managerRows.filter((item) => item.row.season !== latestSeason);
  const priorOvrValues = priorSeasons
    .map((item) => item.ovr)
    .filter((score): score is number => score != null);
  const previousOvr = priorOvrValues.length ? clamp(average(priorOvrValues) ?? 50) : null;
  const sampleGames = managerRows.reduce((sum, item) => sum + item.metric.games, 0);
  const sampleSeasons = new Set(managerRows.map((item) => item.row.season)).size;
  const snapshotWeeks = managerRows.reduce((sum, item) => sum + item.metric.snapshots, 0);
  const evidence = (name: TraitName) =>
    managerRows.reduce((sum, item) => {
      if (name === "Aggression" || name === "Risk")
        return sum + (name === "Risk" || item.metric.Aggression != null ? item.metric.games : 0);
      if (name === "Loyalty") return sum + item.row.rosterTransitions;
      if (name === "Start/Sit IQ") return sum + item.row.benchWeeks;
      if (name === "Waiver IQ") return sum + item.row.waiverPlayerWeeks;
      if (name === "Trade Instinct") return sum + item.row.tradePlayerWeeks;
      if (name === "Patience") return sum + item.row.slumpOpportunities;
      if (name === "Clutch")
        return sum + item.row.games.filter((game) => game.playoff || game.week >= 13).length;
      if (name === "Pettiness") return sum + item.metric.rivalGames;
      return sum + item.row.games.length;
    }, 0);
  const basis: Record<TraitName, string> = {
    Risk: "Proxy: weekly scoring swings plus acquisition/trade rate; direct risk preference is not recorded.",
    Aggression: "Acquisitions and trades per regular-season game, from ESPN team counters.",
    Loyalty: "Roster-player retention between adjacent saved weekly snapshots.",
    "Start/Sit IQ":
      "Proxy: inverse of bench points as a share of total roster points in saved snapshots; not an optimal-lineup replay.",
    "Waiver IQ":
      "Average weekly production from rostered players tagged as waiver/free-agent pickups in saved snapshots.",
    "Trade Instinct":
      "Average weekly production from rostered players tagged as trade acquisitions; trade value versus outgoing players is unavailable.",
    Patience:
      "Share of below-median player weeks followed by retention on that roster next week; requires three observed player weeks.",
    Volatility: "Standard deviation of weekly scoring relative to the league average.",
    Clutch: "Win rate in playoffs and weeks 13 onward; small samples remain noisy.",
    Consistency:
      "Inverse league percentile of weekly scoring dispersion relative to league averages.",
    Pettiness:
      "Largest win-rate difference against a rival with at least three games; requires eight total head-to-head games across at least two such rivals. Rivalry performance is only a proxy for manager decisions.",
    Chaos:
      "Week-to-week all-play rank swings plus actual-outcome surprises versus all-play expectation.",
    Luck: "Actual regular-season win rate minus all-play expected win rate; higher means more favorable schedule outcomes.",
  };

  return {
    ovr,
    previousOvr,
    ovrChange: previousOvr == null ? null : ovr - previousOvr,
    archetype: chooseArchetype(archetypeScores, ovr),
    explanation: explain(archetypeScores),
    traits: names.map((name) => ({
      name,
      score: traitScores[name] == null ? null : clamp(traitScores[name]),
      basis: basis[name],
      sample: evidence(name),
    })),
    sampleGames,
    sampleSeasons,
    snapshotWeeks,
  };
}
