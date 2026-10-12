import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildManagerStory,
  persistStoryEntries,
  requireStoryEntries,
  type ManagerStoryEntry,
} from "./manager-stories";
import type { RawSeason, RawTeam } from "./league.server";

export async function updateManagerStory(
  managerKey: string,
  managerName: string,
  seasons: RawSeason[],
  helpers: {
    teamManagers: (season: RawSeason, team: RawTeam) => string[];
    teamName: (team: RawTeam) => string;
  },
) {
  const storyClient = supabaseAdmin as unknown as SupabaseClient;
  const table = storyClient.from("manager_story_entries");
  const { data, error } = await table
    .select("manager_key, entry_type, section, season, week, event_key, title, content, created_at")
    .eq("manager_key", managerKey)
    .order("season", { ascending: true })
    .order("week", { ascending: true })
    .order("created_at", { ascending: true })
    .order("event_key", { ascending: true });

  const existing = requireStoryEntries(data as ManagerStoryEntry[] | null, error);
  const built = buildManagerStory(managerKey, managerName, seasons, existing, helpers);
  if (!built.additions.length) return built.story;

  // ON CONFLICT DO NOTHING is essential: a retry or concurrent profile request
  // may evaluate the same week, but it must never replace published history.
  const saved = await persistStoryEntries(built.additions, (entries) =>
    table.upsert(entries, {
      onConflict: "manager_key,event_key",
      ignoreDuplicates: true,
    }),
  );
  if (!saved) {
    console.error("Manager story append error: persistence failed.");
    throw new Error("Unable to persist manager story entries.");
  }
  return built.story;
}
