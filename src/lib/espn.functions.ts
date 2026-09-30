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

const FAN_BASE = "https://fan.api.espn.com/apis/v2/services/fan";

function normalizeSwid(raw: string): string {
  const trimmed = raw.trim().replace(/^SWID=/i, "").trim();
  return trimmed.startsWith("{") ? trimmed : `{${trimmed.replace(/^\{|\}$/g, "")}}`;
}

function normalizeS2(raw: string): string {
  return raw.trim().replace(/^espn_s2=/i, "").trim();
}

type FanPreference = {
  id?: string;
  typeId?: number;
  metaData?: {
    entry?: {
      entryId?: number | string;
      entryMetadata?: { teamName?: string };
      name?: string;
      groups?: Array<{ groupId?: number | string; groupName?: string }>;
      seasonId?: number;
      gameId?: string;
      abbrev?: string;
    };
  };
};

/**
 * Reads the ESPN fan profile for the given SWID. Returns the display name and
 * every fantasy football league/team the account is a member of.
 */
async function fetchEspnProfile(swid: string, espnS2: string) {
  const url = `${FAN_BASE}/${encodeURIComponent(swid)}?displayEvents=true&displayNow=true&displayRecs=true&context=fantasy&featureFlags=challengeEntries&platform=web&source=ESPN.com+-+FAM&lang=en`;

  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      cookie: `SWID=${swid}; espn_s2=${espnS2}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    return { ok: false as const, error: "ESPN rejected those values. Copy them again from your browser." };
  }
  if (!res.ok) {
    return { ok: false as const, error: `ESPN returned an error (${res.status}). Try again in a moment.` };
  }

  const json = (await res.json()) as {
    displayName?: string;
    firstName?: string;
    preferences?: FanPreference[];
  };

  const leagues: EspnLeagueSummary[] = [];
  for (const pref of json.preferences ?? []) {
    const entry = pref.metaData?.entry;
    if (!entry) continue;
    const group = entry.groups?.[0];
    if (!group?.groupId) continue;
    if (entry.gameId && entry.gameId !== "1" && entry.gameId !== "ffl") continue;
    leagues.push({
      leagueId: String(group.groupId),
      seasonId: entry.seasonId ?? 0,
      leagueName: group.groupName ?? "Unnamed league",
      teamName: entry.entryMetadata?.teamName ?? entry.name ?? null,
    });
  }

  return {
    ok: true as const,
    displayName: json.displayName ?? json.firstName ?? null,
    leagues,
  };
}

export const connectEspn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { swid: string; espnS2: string }) => {
    if (!input?.swid?.trim() || !input?.espnS2?.trim()) {
      throw new Error("Both ESPN values are required.");
    }
    return { swid: normalizeSwid(input.swid), espnS2: normalizeS2(input.espnS2) };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string; status?: EspnConnectionStatus }> => {
    const profile = await fetchEspnProfile(data.swid, data.espnS2);
    if (!profile.ok) return { ok: false, error: profile.error };

    const verifiedAt = new Date().toISOString();
    const { error } = await context.supabase.from("espn_connections").upsert({
      user_id: context.userId,
      swid: data.swid,
      espn_s2: data.espnS2,
      espn_display_name: profile.displayName,
      last_verified_at: verifiedAt,
    });
    if (error) return { ok: false, error: "Could not save your ESPN connection. Please try again." };

    return {
      ok: true,
      status: {
        connected: true,
        espnDisplayName: profile.displayName,
        lastVerifiedAt: verifiedAt,
        leagues: profile.leagues,
      },
    };
  });

export const getEspnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EspnConnectionStatus> => {
    const { data } = await context.supabase
      .from("espn_connections")
      .select("swid, espn_s2, espn_display_name, last_verified_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!data) {
      return { connected: false, espnDisplayName: null, lastVerifiedAt: null, leagues: [] };
    }

    const profile = await fetchEspnProfile(data.swid, data.espn_s2);
    return {
      connected: true,
      espnDisplayName: profile.ok ? (profile.displayName ?? data.espn_display_name) : data.espn_display_name,
      lastVerifiedAt: data.last_verified_at,
      leagues: profile.ok ? profile.leagues : [],
    };
  });

export const disconnectEspn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("espn_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });
