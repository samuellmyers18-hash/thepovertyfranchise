import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMatchups } from "@/lib/league.functions";
import { MatchupCard } from "@/components/LeagueHome";

export const Route = createFileRoute("/_authenticated/matchups")({
  head: () => ({
    meta: [
      { title: "Matchups — The Poverty Franchise" },
      { name: "description", content: "Every head-to-head matchup, week by week, across every Poverty Franchise season." },
      { property: "og:title", content: "Matchups — The Poverty Franchise" },
      { property: "og:description", content: "Every head-to-head matchup, week by week, across every Poverty Franchise season." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchupsPage,
});

function MatchupsPage() {
  const fetchMatchups = useServerFn(getMatchups);
  const [season, setSeason] = useState<number | undefined>(undefined);
  const [week, setWeek] = useState<number | undefined>(undefined);
  const { data, isLoading } = useQuery({
    queryKey: ["matchups", season ?? "latest", week ?? "latest"],
    queryFn: () => fetchMatchups({ data: { season, week } }),
  });

  const sel = "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">The Poverty Franchise</p>
      <h1 className="mb-6 text-6xl text-foreground">Matchups</h1>

      {data && (
        <div className="mb-8 flex flex-wrap gap-3">
          <select className={sel} value={data.season ?? ""} onChange={(e) => { setSeason(Number(e.target.value)); setWeek(undefined); }}>
            {data.years.map((y) => <option key={y} value={y}>{y} season</option>)}
          </select>
          <select className={sel} value={data.week} onChange={(e) => setWeek(Number(e.target.value))}>
            {data.weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Loading matchups…</p>
      ) : !data || data.matchups.length === 0 ? (
        <p className="text-destructive">{data?.error ?? "No matchups found for that week."}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.matchups.map((m, i) => <MatchupCard key={i} m={m} />)}
        </div>
      )}
      <p className="mt-8 text-sm text-muted-foreground"><Link to="/" className="hover:text-primary">← Home</Link></p>
    </main>
  );
}
