import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EspnLeagueSummary = {
  leagueId: string;
  seasonId: number;
  leagueName: string;
  teamName: string | null;
};

export type EspnConnectionStatus = {
  connected: boolean;
  espnDisplayName: string | null;
  lastVerifiedAt: string | null;
  leagues: EspnLeagueSummary[];
};

const LEAGUE_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

function normalizeSwid(raw: string): string {
  const trimmed = raw.trim().replace(/^SWID=/i, "").trim();
  return `{${trimmed.replace(/^\{|\}$/g, "")}}`;
}

function normalizeS2(raw: string): string {
  let v = raw.trim().replace(/^espn_s2=/i, "").trim();
  // Chrome sometimes shows the cookie URL-encoded; ESPN accepts either, but avoid double-encoding.
  try {
    if (/%[0-9A-F]{2}/i.test(v)) v = decodeURIComponent(v);
  } catch {
    /* keep raw */
  }
  return v;
}

function normalizeLeagueId(raw: string): string {
  const m = raw.match(/leagueId=(\d+)/i) ?? raw.match(/(\d{3,})/);
  return m ? m[1] : raw.trim();
}

type LeagueJson = {
  id?: number;
  seasonId?: number;
  settings?: { name?: string };
  status?: { previousSeasons?: number[] };
  members?: Array<{ id?: string; displayName?: string; firstName?: string; lastName?: string }>;
  teams?: Array<{ id?: number; name?: string; location?: string; nickname?: string; owners?: string[] }>;
};

async function fetchLeague(leagueId: string, swid: string, espnS2: string) {
  const season = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const headers = {
    accept: "application/json",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    cookie: `SWID=${swid}; espn_s2=${espnS2}`,
  };

  let res: Response | null = null;
  for (const year of [season, season - 1]) {
    res = await fetch(`${LEAGUE_BASE}/seasons/${year}/segments/0/leagues/${leagueId}?view=mSettings&view=mTeam`, {
      headers,
    });
    if (res.status !== 404) break;
  }
  if (!res) return { ok: false as const, error: "Couldn't reach ESPN." };

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false as const,
      error: "ESPN said no access. Copy SWID and espn_s2 again while logged in, and check the league ID.",
    };
  }
  if (res.status === 404) {
    return { ok: false as const, error: "ESPN couldn't find that league ID. Double-check the number." };
  }
  if (!res.ok) {
    console.error("ESPN league fetch failed", res.status);
    return { ok: false as const, error: `ESPN returned an error (${res.status}). Try again in a moment.` };
  }

  const json = (await res.json()) as LeagueJson;
  const me = json.members?.find((m) => m.id?.toUpperCase() === swid.toUpperCase());
  const myTeam = json.teams?.find((t) => t.owners?.some((o) => o.toUpperCase() === swid.toUpperCase()));
  const teamName = myTeam ? (myTeam.name ?? `${myTeam.location ?? ""} ${myTeam.nickname ?? ""}`.trim()) : null;

  const league: EspnLeagueSummary = {
    leagueId,
    seasonId: json.seasonId ?? season,
    leagueName: json.settings?.name ?? "Your league",
    teamName: teamName || null,
  };

  return {
    ok: true as const,
    displayName: me ? (me.displayName ?? [me.firstName, me.lastName].filter(Boolean).join(" ")) : null,
    leagues: [league],
  };
}

export const connectEspn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { swid: string; espnS2: string; leagueId: string }) => {
    if (!input?.swid?.trim() || !input?.espnS2?.trim() || !input?.leagueId?.trim()) {
      throw new Error("League ID, SWID and espn_s2 are all required.");
    }
    return {
      swid: normalizeSwid(input.swid),
      espnS2: normalizeS2(input.espnS2),
      leagueId: normalizeLeagueId(input.leagueId),
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string; status?: EspnConnectionStatus }> => {
    const result = await fetchLeague(data.leagueId, data.swid, data.espnS2);
    if (!result.ok) return { ok: false, error: result.error };

    const verifiedAt = new Date().toISOString();
    const { error } = await context.supabase.from("espn_connections").upsert({
      user_id: context.userId,
      swid: data.swid,
      espn_s2: data.espnS2,
      league_id: data.leagueId,
      espn_display_name: result.displayName,
      last_verified_at: verifiedAt,
    });
    if (error) {
      console.error("save espn connection", error);
      return { ok: false, error: "Could not save your ESPN connection. Please try again." };
    }

    return {
      ok: true,
      status: {
        connected: true,
        espnDisplayName: result.displayName,
        lastVerifiedAt: verifiedAt,
        leagues: result.leagues,
      },
    };
  });

export const getEspnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EspnConnectionStatus> => {
    const { data } = await context.supabase
      .from("espn_connections")
      .select("swid, espn_s2, league_id, espn_display_name, last_verified_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!data || !data.league_id) {
      return { connected: false, espnDisplayName: null, lastVerifiedAt: null, leagues: [] };
    }

    const result = await fetchLeague(data.league_id, data.swid, data.espn_s2);
    return {
      connected: true,
      espnDisplayName: result.ok ? (result.displayName ?? data.espn_display_name) : data.espn_display_name,
      lastVerifiedAt: data.last_verified_at,
      leagues: result.ok ? result.leagues : [],
    };
  });

export const disconnectEspn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("espn_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });
