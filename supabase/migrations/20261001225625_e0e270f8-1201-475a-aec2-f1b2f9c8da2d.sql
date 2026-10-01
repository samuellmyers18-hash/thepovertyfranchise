CREATE TABLE public.manager_names (
  manager_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.manager_names TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.manager_names TO authenticated;
GRANT ALL ON public.manager_names TO service_role;
ALTER TABLE public.manager_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read manager names" ON public.manager_names FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can add manager names" ON public.manager_names FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can change manager names" ON public.manager_names FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can remove manager names" ON public.manager_names FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));