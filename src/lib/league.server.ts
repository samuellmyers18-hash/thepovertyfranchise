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
  home?: { teamId?: number; totalPoints?: number };
  away?: { teamId?: number; totalPoints?: number };
};
export type RawSeason = {
  seasonId?: number;
  status?: { previousSeasons?: number[]; currentMatchupPeriod?: number; latestScoringPeriod?: number };
  settings?: { name?: string; scheduleSettings?: { matchupPeriodCount?: number } };
  members?: Array<{ id?: string; displayName?: string; firstName?: string; lastName?: string }>;
  teams?: RawTeam[];
  schedule?: RawMatch[];
  draftDetail?: { picks?: Array<{ overallPickNumber?: number; roundId?: number; roundPickNumber?: number; teamId?: number; playerId?: number; keeper?: boolean }> };
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

const VIEWS = "view=mTeam&view=mSettings&view=mMatchupScore&view=mDraftDetail";

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
  return { seasons };
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
