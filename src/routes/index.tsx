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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session?.user));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="field-grid min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Est. league archive</p>
        <h1 className="mt-4 text-6xl leading-none text-foreground sm:text-8xl">
          The Poverty
          <br />
          Franchise
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Every season, every matchup, every grudge — all in one place. Step one is getting you signed in and
          hooked up to the league so the history can start flowing in.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          {signedIn ? (
            <Button asChild size="lg">
              <Link to="/connect">Go to your league setup</Link>
            </Button>
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
