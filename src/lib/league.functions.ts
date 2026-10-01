import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

export type ManagerSeason = {
  season: number;
  teamId: number;
  teamName: string;
  coManagers: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  finalRank: number | null;
  seed: number | null;
};

export type ManagerSummary = {
  key: string;
  name: string;
  seasons: ManagerSeason[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
  bestFinish: number | null;
  claimedBy: string | null;
};

type TeamJson = {
  id?: number;
  name?: string;
  location?: string;
  nickname?: string;
  owners?: string[];
  rankCalculatedFinal?: number;
  playoffSeed?: number;
  record?: { overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number } };
};
type LeagueJson = {
  seasonId?: number;
  status?: { previousSeasons?: number[] };
  members?: Array<{ id?: string; displayName?: string; firstName?: string; lastName?: string }>;
  teams?: TeamJson[];
};

export function managerKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchSeason(leagueId: string, year: number, cookie: string): Promise<LeagueJson | null> {
  const headers = { accept: "application/json", cookie, "user-agent": "Mozilla/5.0" };
  const q = "view=mTeam&view=mSettings";
  try {
    const r = await fetch(`${BASE}/seasons/${year}/segments/0/leagues/${leagueId}?${q}`, { headers });
    if (r.ok) return (await r.json()) as LeagueJson;
    const h = await fetch(`${BASE}/leagueHistory/${leagueId}?seasonId=${year}&${q}`, { headers });
    if (h.ok) {
      const arr = (await h.json()) as LeagueJson[];
      return Array.isArray(arr) ? (arr[0] ?? null) : null;
    }
  } catch (e) {
    console.error("espn season fetch", year, e);
  }
  return null;
}

async function loadManagers(): Promise<{ managers: ManagerSummary[]; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin
    .from("espn_connections")
    .select("swid, espn_s2, league_id")
    .not("league_id", "is", null)
    .order("last_verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn?.league_id) return { managers: [], error: "The league isn't connected to ESPN yet." };

  const cookie = `SWID=${conn.swid}; espn_s2=${conn.espn_s2}`;
  const now = new Date();
  const current = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  let latest = await fetchSeason(conn.league_id, current, cookie);
  if (!latest) latest = await fetchSeason(conn.league_id, current - 1, cookie);
  if (!latest) return { managers: [], error: "Couldn't load league data from ESPN." };

  const years = Array.from(new Set([...(latest.status?.previousSeasons ?? []), latest.seasonId ?? current]));
  const seasons = await Promise.all(
    years.map(async (y) => (y === latest!.seasonId ? latest : await fetchSeason(conn.league_id!, y, cookie))),
  );

  const map = new Map<string, ManagerSummary>();
  for (const s of seasons) {
    if (!s?.teams) continue;
    const season = s.seasonId ?? 0;
    for (const t of s.teams) {
      const names = (t.owners ?? [])
        .map((o) => s.members?.find((m) => m.id === o))
        .filter(Boolean)
        .map((m) => ([m!.firstName, m!.lastName].filter(Boolean).join(" ") || m!.displayName || "").trim())
        .filter(Boolean);
      const rec = t.record?.overall ?? {};
      const teamName = (t.name ?? `${t.location ?? ""} ${t.nickname ?? ""}`.trim()) || `Team ${t.id}`;
      for (const n of names) {
        const key = managerKey(n);
        const m =
          map.get(key) ??
          ({ key, name: titleCase(key), seasons: [], wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, championships: 0, bestFinish: null, claimedBy: null } as ManagerSummary);
        const row: ManagerSeason = {
          season,
          teamId: t.id ?? 0,
          teamName,
          coManagers: names.filter((x) => managerKey(x) !== key).map((x) => titleCase(managerKey(x))),
          wins: rec.wins ?? 0,
          losses: rec.losses ?? 0,
          ties: rec.ties ?? 0,
          pointsFor: Math.round((rec.pointsFor ?? 0) * 100) / 100,
          pointsAgainst: Math.round((rec.pointsAgainst ?? 0) * 100) / 100,
          finalRank: t.rankCalculatedFinal || null,
          seed: t.playoffSeed || null,
        };
        m.seasons.push(row);
        m.wins += row.wins;
        m.losses += row.losses;
        m.ties += row.ties;
        m.pointsFor += row.pointsFor;
        m.pointsAgainst += row.pointsAgainst;
        if (row.finalRank === 1) m.championships++;
        if (row.finalRank && (m.bestFinish === null || row.finalRank < m.bestFinish)) m.bestFinish = row.finalRank;
        map.set(key, m);
      }
    }
  }
  const managers = [...map.values()].map((m) => ({
    ...m,
    pointsFor: Math.round(m.pointsFor * 100) / 100,
    pointsAgainst: Math.round(m.pointsAgainst * 100) / 100,
    seasons: m.seasons.sort((a, b) => b.season - a.season),
  }));
  managers.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return { managers };
}

export const getManagers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await loadManagers();
    const { data: claims } = await context.supabase.from("manager_claims").select("manager_key, user_id");
    const claimMap = new Map((claims ?? []).map((c) => [c.manager_key, c.user_id]));
    const myClaim = (claims ?? []).find((c) => c.user_id === context.userId)?.manager_key ?? null;
    return {
      ...result,
      myClaim,
      managers: result.managers.map((m) => ({ ...m, claimedBy: claimMap.get(m.key) ?? null })),
      userId: context.userId,
    };
  });

export const claimManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; name: string }) => ({
    key: managerKey(String(input?.key ?? "")).slice(0, 80),
    name: String(input?.name ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    if (!data.key) return { ok: false, error: "Pick a manager." };
    const { error } = await context.supabase
      .from("manager_claims")
      .insert({ manager_key: data.key, manager_name: data.name, user_id: context.userId });
    if (error) {
      return {
        ok: false,
        error: error.code === "23505" ? "That manager is taken, or you already claimed one." : "Couldn't claim that manager.",
      };
    }
    return { ok: true };
  });

export const releaseManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => ({ key: managerKey(String(input?.key ?? "")) }))
  .handler(async ({ data, context }) => {
    await context.supabase.from("manager_claims").delete().eq("manager_key", data.key);
    return { ok: true };
  });
