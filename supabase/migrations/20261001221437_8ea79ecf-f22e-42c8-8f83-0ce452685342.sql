CREATE TABLE public.manager_claims (
  manager_key text PRIMARY KEY,
  manager_name text NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.manager_claims TO authenticated;
GRANT ALL ON public.manager_claims TO service_role;
ALTER TABLE public.manager_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claims_select" ON public.manager_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "claims_insert_own" ON public.manager_claims FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "claims_delete" ON public.manager_claims FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));