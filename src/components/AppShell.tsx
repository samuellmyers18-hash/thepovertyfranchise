import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Home, Users, User, Swords, ListOrdered, BadgeCheck, Settings, LogOut, LogIn, Menu, X, ClipboardList, CalendarDays, TrendingUp, Trophy, Award, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function load(id: string | undefined) {
      setUserId(id ?? null);
      if (!id) return setIsAdmin(false);
      const { data } = await supabase.rpc("has_role", { _user_id: id, _role: "admin" });
      setIsAdmin(Boolean(data));
    }
    supabase.auth.getUser().then(({ data }) => load(data.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => load(s?.user?.id));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  if (pathname.startsWith("/auth")) return <>{children}</>;

  const item = "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground";
  const active = { className: "bg-secondary text-primary" };

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <Link to="/" className="mb-6 px-3 text-3xl leading-none text-primary">Poverty<br />Franchise</Link>
      <Link to="/" className={item} activeProps={active} activeOptions={{ exact: true }}><Home className="h-4 w-4" />Home</Link>
      {userId && (
        <>
          <Link to="/managers" className={item} activeProps={active}><Users className="h-4 w-4" />Managers</Link>
          <Link to="/rivalries" className={item} activeProps={active}><Swords className="h-4 w-4" />Rivalries</Link>
          <Link to="/drafts" className={item} activeProps={active}><ListOrdered className="h-4 w-4" />Draft recaps</Link>
          <Link to="/rosters" className={item} activeProps={active}><ClipboardList className="h-4 w-4" />Rosters</Link>
          <Link to="/matchups" className={item} activeProps={active}><CalendarDays className="h-4 w-4" />Matchups</Link>
          <Link to="/players" className={item} activeProps={active}><TrendingUp className="h-4 w-4" />Player rankings</Link>
          <Link to="/records" className={item} activeProps={active}><Trophy className="h-4 w-4" />Records</Link>
          <Link to="/awards" className={item} activeProps={active}><Award className="h-4 w-4" />Awards</Link>
          <Link to="/newsletter" className={item} activeProps={active}><Newspaper className="h-4 w-4" />The Poverty Post</Link>
          <Link to="/profile" className={item} activeProps={active}><User className="h-4 w-4" />My profile</Link>
          <Link to="/claim" className={item} activeProps={active}><BadgeCheck className="h-4 w-4" />Claim manager</Link>
          {isAdmin && <Link to="/admin" className={item} activeProps={active}><Settings className="h-4 w-4" />Admin settings</Link>}
        </>
      )}
      <div className="mt-auto">
        {userId ? (
          <button className={`${item} w-full`} onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" />Sign out</button>
        ) : (
          <Link to="/auth" className={item}><LogIn className="h-4 w-4" />Sign in</Link>
        )}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block md:sticky md:top-0 md:h-screen">{nav}</aside>
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Link to="/" className="text-2xl text-primary">Poverty Franchise</Link>
        <button aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-6 w-6 text-foreground" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-card">
            <button aria-label="Close menu" className="absolute right-3 top-3" onClick={() => setOpen(false)}><X className="h-5 w-5 text-foreground" /></button>
            {nav}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
