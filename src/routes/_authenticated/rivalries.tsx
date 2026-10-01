import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRivalries } from "@/lib/league.functions";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/rivalries")({
  head: () => ({
    meta: [
      { title: "Rivalries — The Poverty Franchise" },
      { name: "description", content: "Head-to-head records between every pair of managers." },
      { property: "og:title", content: "Rivalries — The Poverty Franchise" },
      { property: "og:description", content: "Head-to-head records between every pair of managers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RivalriesPage,
});

function RivalriesPage() {
  const fetchR = useServerFn(getRivalries);
  const { data, isLoading } = useQuery({ queryKey: ["rivalries"], queryFn: () => fetchR(), staleTime: 5 * 60_000 });
  const [q, setQ] = useState("");
  const list = (data?.rivalries ?? []).filter((r) => `${r.a} ${r.b}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-5xl text-foreground">Rivalries</h1>
      <p className="mt-2 text-muted-foreground">Every manager-vs-manager history, most-played first. Playoff games included.</p>
      <Input className="mt-6 max-w-sm" placeholder="Filter by manager name" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <p className="mt-8 text-muted-foreground">Crunching every matchup…</p>}
      {data?.error && <p className="mt-8 text-destructive">{data.error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {list.map((r) => {
          const leader = r.aWins === r.bWins ? "Dead even" : `${r.aWins > r.bWins ? r.a : r.b} leads`;
          return (
            <div key={`${r.a}|${r.b}`} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-foreground">{r.a} <span className="text-muted-foreground">vs</span> {r.b}</p>
                <p className="text-2xl text-primary">{r.aWins}-{r.bWins}{r.ties ? `-${r.ties}` : ""}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {leader} · {r.games} games{r.playoffGames ? ` (${r.playoffGames} playoff)` : ""} · avg margin {r.avgMargin.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Points: {r.aPts.toFixed(1)} – {r.bPts.toFixed(1)} · Last: {r.last}</p>
            </div>
          );
        })}
      </div>
    </main>
  );
}
