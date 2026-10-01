// Server-only: loads raw ESPN league data for every season using the admin's stored connection.
const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

export type RawTeam = {
  id?: number;
  name?: string;
  location?: string;
  nickname?: string;
  owners?: string[];
  rankCalculatedFinal?: number;
  playoffSeed?: number;
  record?: { overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number; streakLength?: number; streakType?: string } };
};
export type RawMatch = {
  matchupPeriodId?: number;
  playoffTierType?: string;
  winner?: string;
  home?: { teamId?: number; totalPoints?: number; totalProjectedPointsLive?: number; pointsByScoringPeriod?: Record<string, number>; cumulativeScore?: { scoreByScoringPeriod?: Record<string, number> } };
  away?: { teamId?: number; totalPoints?: number; totalProjectedPointsLive?: number; pointsByScoringPeriod?: Record<string, number>; cumulativeScore?: { scoreByScoringPeriod?: Record<string, number> } };
};

/**
 * Split a matchup into single-week scores. Two-week playoff matchups arrive as
 * one cumulative total; scoreByScoringPeriod gives each week separately.
 * Falls back to the matchup total when the breakdown is missing.
 */
export function matchWeeks(m: RawMatch): Array<{ period: number; homePts: number; awayPts: number }> {
  const hp = m.home?.pointsByScoringPeriod ?? m.home?.cumulativeScore?.scoreByScoringPeriod;
  const ap = m.away?.pointsByScoringPeriod ?? m.away?.cumulativeScore?.scoreByScoringPeriod;
  const periods = [...new Set([...Object.keys(hp ?? {}), ...Object.keys(ap ?? {})])]
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (periods.length <= 1) return [{ period: m.matchupPeriodId ?? 0, homePts: m.home?.totalPoints ?? 0, awayPts: m.away?.totalPoints ?? 0 }];
  return periods.map((p) => ({ period: p, homePts: hp?.[String(p)] ?? 0, awayPts: ap?.[String(p)] ?? 0 }));
}
export type RawSeason = {
  seasonId?: number;
  status?: { previousSeasons?: number[]; currentMatchupPeriod?: number; latestScoringPeriod?: number };
  settings?: { name?: string; scheduleSettings?: { matchupPeriodCount?: number } };
  members?: Array<{ id?: string; displayName?: string; firstName?: string; lastName?: string }>;
  teams?: RawTeam[];
  schedule?: RawMatch[];
  draftDetail?: { picks?: Array<{ overallPickNumber?: number; roundId?: number; roundPickNumber?: number; teamId?: number; playerId?: number; keeper?: boolean }> };
  transactions?: Array<{
    id?: number;
    type?: string; // WAIVER | FREEAGENT | TRADE | etc.
    status?: string; // EXECUTED etc.
    proposedDate?: number;
    executionDate?: number;
    teamId?: number;
    bidAmount?: number;
    items?: Array<{ type?: string; playerId?: number; fromTeamId?: number; toTeamId?: number }>;
  }>;
};

export function managerKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
export function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
export function teamName(t: RawTeam) {
  return (t.name ?? `${t.location ?? ""} ${t.nickname ?? ""}`.trim()) || `Team ${t.id}`;
}
/** Manager names (title-cased, merged by name) for a team in a season. */
export function teamManagers(s: RawSeason, t: RawTeam): string[] {
  return (t.owners ?? [])
    .map((o) => s.members?.find((m) => m.id === o))
    .filter(Boolean)
    .map((m) => ([m!.firstName, m!.lastName].filter(Boolean).join(" ") || m!.displayName || "").trim())
    .filter(Boolean)
    .map((n) => titleCase(managerKey(n)));
}

async function getConn() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("espn_connections")
    .select("swid, espn_s2, league_id")
    .not("league_id", "is", null)
    .order("last_verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

const VIEWS = "view=mTeam&view=mSettings&view=mMatchupScore&view=mMatchup&view=mDraftDetail&view=mTransactions2";

async function fetchSeason(leagueId: string, year: number, cookie: string): Promise<RawSeason | null> {
  const headers = { accept: "application/json", cookie, "user-agent": "Mozilla/5.0" };
  try {
    const r = await fetch(`${BASE}/seasons/${year}/segments/0/leagues/${leagueId}?${VIEWS}`, { headers });
    if (r.ok) return (await r.json()) as RawSeason;
    const h = await fetch(`${BASE}/leagueHistory/${leagueId}?seasonId=${year}&${VIEWS}`, { headers });
    if (h.ok) {
      const arr = (await h.json()) as RawSeason[];
      return Array.isArray(arr) ? (arr[0] ?? null) : null;
    }
  } catch (e) {
    console.error("espn season fetch", year, e);
  }
  return null;
}

export type RawRosterEntry = { playerId?: number; lineupSlotId?: number; acquisitionDate?: number; acquisitionType?: string };
export type RawRosterTeam = { id?: number; roster?: { entries?: RawRosterEntry[] } };

/** Fetches every team's roster for one scoring period (week) of a season. */
export async function fetchRosterWeek(year: number, week: number): Promise<RawRosterTeam[] | null> {
  const conn = await getConn();
  if (!conn?.league_id) return null;
  const headers = { accept: "application/json", cookie: `SWID=${conn.swid}; espn_s2=${conn.espn_s2}`, "user-agent": "Mozilla/5.0" };
  const q = `view=mRoster&scoringPeriodId=${week}`;
  try {
    const r = await fetch(`${BASE}/seasons/${year}/segments/0/leagues/${conn.league_id}?${q}`, { headers });
    if (r.ok) return ((await r.json()) as { teams?: RawRosterTeam[] }).teams ?? [];
    const h = await fetch(`${BASE}/leagueHistory/${conn.league_id}?seasonId=${year}&${q}`, { headers });
    if (h.ok) {
      const arr = (await h.json()) as Array<{ teams?: RawRosterTeam[] }>;
      return (Array.isArray(arr) ? arr[0]?.teams : null) ?? [];
    }
  } catch (e) {
    console.error("espn roster fetch", year, week, e);
  }
  return null;
}

export async function loadAllSeasons(): Promise<{ seasons: RawSeason[]; error?: string }> {
  const conn = await getConn();
  if (!conn?.league_id) return { seasons: [], error: "The league isn't connected to ESPN yet." };
  const cookie = `SWID=${conn.swid}; espn_s2=${conn.espn_s2}`;
  const now = new Date();
  const current = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  let latest = await fetchSeason(conn.league_id, current, cookie);
  if (!latest) latest = await fetchSeason(conn.league_id, current - 1, cookie);
  if (!latest) return { seasons: [], error: "Couldn't load league data from ESPN." };
  const years = (latest.status?.previousSeasons ?? []).filter((y) => y !== latest!.seasonId);
  const past = await Promise.all(years.map((y) => fetchSeason(conn.league_id!, y, cookie)));
  const seasons = [latest, ...past.filter((s): s is RawSeason => Boolean(s?.teams))];
  seasons.sort((a, b) => (b.seasonId ?? 0) - (a.seasonId ?? 0));
  await applyManagerNames(seasons);
  return { seasons };
}

/** Rename managers per the admin's overrides (applies to current and past seasons). */
async function applyManagerNames(seasons: RawSeason[]) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("manager_names").select("manager_key, display_name");
    if (!data?.length) return;
    const overrides = new Map(data.map((r) => [r.manager_key, r.display_name]));
    for (const s of seasons) {
      for (const m of s.members ?? []) {
        const raw = ([m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName || "").trim();
        const nice = overrides.get(managerKey(raw));
        if (nice) { m.firstName = nice; m.lastName = ""; }
      }
    }
  } catch { /* overrides are optional */ }
}

export async function loadPlayerNames(year: number, ids: number[]): Promise<Record<number, string>> {
  const conn = await getConn();
  if (!conn || ids.length === 0) return {};
  const filter = { players: { filterIds: { value: ids }, limit: ids.length } };
  try {
    const r = await fetch(`${BASE}/seasons/${year}/players?scoringPeriodId=0&view=players_wl`, {
      headers: {
        accept: "application/json",
        cookie: `SWID=${conn.swid}; espn_s2=${conn.espn_s2}`,
        "x-fantasy-filter": JSON.stringify(filter),
        "user-agent": "Mozilla/5.0",
      },
    });
    if (!r.ok) return {};
    const arr = (await r.json()) as Array<{ id?: number; fullName?: string }>;
    return Object.fromEntries(arr.filter((p) => p.id && p.fullName).map((p) => [p.id!, p.fullName!]));
  } catch {
    return {};
  }
}

export type RawPoolPlayer = {
  onTeamId?: number;
  player?: {
    id?: number; fullName?: string; defaultPositionId?: number; proTeamId?: number; injuryStatus?: string;
    ownership?: { percentOwned?: number; percentChange?: number };
    draftRanksByRankType?: Record<string, { rank?: number }>;
    stats?: Array<{ statSourceId?: number; statSplitTypeId?: number; seasonId?: number; scoringPeriodId?: number; appliedTotal?: number; appliedAverage?: number }>;
  };
};

export async function fetchPlayerPool(year: number, week: number): Promise<RawPoolPlayer[] | null> {
  const conn = await getConn();
  if (!conn?.league_id) return null;
  const filter = {
    players: {
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      limit: 400,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [`00${year}`, `10${year}`, `11${year}${week}`] },
    },
  };
  try {
    const r = await fetch(`${BASE}/seasons/${year}/segments/0/leagues/${conn.league_id}?view=kona_player_info&scoringPeriodId=${week}`, {
      headers: {
        accept: "application/json",
        cookie: `SWID=${conn.swid}; espn_s2=${conn.espn_s2}`,
        "x-fantasy-filter": JSON.stringify(filter),
        "user-agent": "Mozilla/5.0",
      },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { players?: RawPoolPlayer[] };
    return j.players ?? [];
  } catch {
    return null;
  }
}
