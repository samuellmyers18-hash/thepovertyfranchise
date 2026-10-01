import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Poverty Franchise — Fantasy Football History" },
      {
        name: "description",
        content:
          "The home of The Poverty Franchise: claim your manager, then dig through power rankings, team history, season records and rivalries.",
      },
      { property: "og:title", content: "The Poverty Franchise — Fantasy Football History" },
      {
        property: "og:description",
        content: "Claim your manager and explore every season of The Poverty Franchise.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load(userId: string | undefined) {
      setSignedIn(Boolean(userId));
      if (!userId) return setIsAdmin(false);
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      setIsAdmin(Boolean(data));
    }
    supabase.auth.getUser().then(({ data }) => load(data.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <main className="field-grid min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Est. league archive</p>
        <h1 className="mt-4 text-6xl leading-none text-foreground sm:text-8xl">
          The Poverty
          <br />
          Franchise
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Every season, every matchup, every grudge — all in one place.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          {signedIn ? (
            <>
              <Button asChild size="lg">
                <Link to="/managers">Claim your manager</Link>
              </Button>
              {isAdmin && (
                <Button asChild size="lg">
                  <Link to="/admin">Admin settings</Link>
                </Button>
              )}
              <Button size="lg" variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="lg">
              <Link to="/auth">Sign in or create an account</Link>
            </Button>
          )}
        </div>

        <div className="mt-16 grid gap-4 border-t border-border pt-8 sm:grid-cols-3">
          {[
            ["Power rankings", "Coming next"],
            ["Team history & records", "Coming next"],
            ["Rivalries by matchup", "Coming next"],
          ].map(([title, note]) => (
            <div key={title}>
              <h3 className="text-xl text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
