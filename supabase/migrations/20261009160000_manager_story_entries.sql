CREATE TABLE public.manager_story_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_key text NOT NULL,
  entry_type text NOT NULL CHECK (
    entry_type IN ('career_summary', 'current_season_summary', 'chapter', 'week_evaluation')
  ),
  section text,
  season integer NOT NULL CHECK (season > 0),
  week integer NOT NULL CHECK (week >= 0),
  event_key text NOT NULL,
  title text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manager_story_entries_content_shape CHECK (
    (
      entry_type IN ('career_summary', 'current_season_summary')
      AND section IS NULL
      AND title IS NULL
      AND length(content) > 0
    )
    OR (
      entry_type = 'chapter'
      AND section IN ('career_foundation', 'defining_moment', 'rivalry')
      AND title IS NOT NULL
      AND length(title) > 0
      AND length(content) > 0
    )
    OR (
      entry_type = 'week_evaluation'
      AND section IS NULL
      AND title IS NULL
      AND content = ''
    )
  ),
  CONSTRAINT manager_story_entries_event_unique UNIQUE (manager_key, event_key)
);

CREATE INDEX manager_story_entries_history_idx
  ON public.manager_story_entries (manager_key, season DESC, week DESC, created_at DESC);

ALTER TABLE public.manager_story_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_story_entries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.manager_story_entries TO authenticated;
GRANT SELECT, INSERT ON public.manager_story_entries TO service_role;

CREATE POLICY "Signed-in users can read manager stories"
  ON public.manager_story_entries
  FOR SELECT
  TO authenticated
  USING (entry_type <> 'week_evaluation');
