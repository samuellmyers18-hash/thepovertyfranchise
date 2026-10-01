import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRivalries, type Rivalry } from "@/lib/league.functions";
import { Input } from "@/components/ui/input";
import { Swords, Flame, Scale, Trophy } from "lucide-react";

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

const mKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

function winBar(r: Rivalry) {
  const total = r.aWins + r.bWins + r.ties || 1;
  return { a: (r.aWins / total) * 100, b: (r.bWins / total) * 100, t: (r.ties / total) * 100 };
}

function FeaturedCard({ r, rank }: { r: Rivalry; rank: number }) {
  const bar = winBar(r);
  const leader = r.aWins === r.bWins ? null : r.aWins > r.bWins ? r.a : r.b;
  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/40 bg-card p-6 shadow-lg shadow-primary/10">
      <div className="absolute -right-4 -top-6 select-none text-[7rem] font-black leading-none text-primary/10">{rank}</div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
        <Swords className="h-4 w-4" /> Featured rivalry
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <Link to="/managers/$key" params={{ key: mKey(r.a) }} className="text-2xl font-black text-foreground hover:text-primary sm:text-3xl">{r.a}</Link>
        <span className="pb-1 text-sm font-bold uppercase text-muted-foreground">vs</span>
        <Link to="/managers/$key" params={{ key: mKey(r.b) }} className="text-right text-2xl font-black text-foreground hover:text-primary sm:text-3xl">{r.b}</Link>
      </div>
      <div className="mt-4 flex items-center justify-between text-4xl font-black sm:text-5xl">
        <span className={r.aWins >= r.bWins ? "text-primary" : "text-muted-foreground"}>{r.aWins}</span>
        <span className="text-lg font-semibold text-muted-foreground">–{r.ties ? `${r.ties}–` : ""}</span>
        <span className={r.bWins > r.aWins ? "text-primary" : "text-muted-foreground"}>{r.bWins}</span>
      </div>
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${bar.a}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${bar.t}%` }} />
        <div className="bg-secondary" style={{ width: `${bar.b}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {leader ? <span className="font-semibold text-foreground">{leader} leads the series</span> : <span className="font-semibold text-foreground">Dead even</span>}
        {" · "}{r.games} games across {r.seasonCount} season{r.seasonCount === 1 ? "" : "s"}
        {r.playoffGames ? ` · ${r.playoffGames} in the playoffs` : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg margin</p>
          <p className="mt-1 text-lg font-bold text-foreground">{r.avgMargin.toFixed(1)}</p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Biggest win</p>
          <p className="mt-1 text-lg font-bold text-foreground">{r.biggestWin.toFixed(1)}</p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Closest game</p>
          <p className="mt-1 text-lg font-bold text-foreground">{r.closest == null ? "—" : r.closest.toFixed(1)}</p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Best scores</p>
          <p className="mt-1 text-lg font-bold text-foreground">{r.aBest.toFixed(0)} / {r.bBest.toFixed(0)}</p>
        </div>
      </div>
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">Last meeting:</span> {r.last}
      </p>
    </div>
  );
}

function RivalriesPage() {
  const fetchR = useServerFn(getRivalries);
  const { data, isLoading } = useQuery({ queryKey: ["rivalries"], queryFn: () => fetchR(), staleTime: 5 * 60_000 });
  const [q, setQ] = useState("");
  const all = data?.rivalries ?? [];
  const featured = all.slice(0, 3);
  const list = all.filter((r) => `${r.a} ${r.b}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-5xl text-foreground">Rivalries</h1>
      <p className="mt-2 text-muted-foreground">Every manager-vs-manager history, most-played first. Playoff games included, counted week by week.</p>
      {isLoading && <p className="mt-8 text-muted-foreground">Crunching every matchup…</p>}
      {data?.error && <p className="mt-8 text-destructive">{data.error}</p>}

      {featured.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-2xl text-foreground"><Flame className="h-5 w-5 text-primary" /> The big ones</h2>
          <div className="mt-4 grid gap-5 lg:grid-cols-1">
            {featured.map((r, i) => <FeaturedCard key={`${r.a}|${r.b}`} r={r} rank={i + 1} />)}
          </div>
        </section>
      )}

      <div className="mt-10 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl text-foreground"><Scale className="h-5 w-5 text-primary" /> Every matchup</h2>
        <Input className="max-w-xs" placeholder="Filter by manager name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {list.map((r) => {
          const leader = r.aWins === r.bWins ? "Dead even" : `${r.aWins > r.bWins ? r.a : r.b} leads`;
          const bar = winBar(r);
          return (
            <div key={`${r.a}|${r.b}`} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-foreground">
                  <Link to="/managers/$key" params={{ key: mKey(r.a) }} className="hover:text-primary">{r.a}</Link>
                  <span className="text-muted-foreground"> vs </span>
                  <Link to="/managers/$key" params={{ key: mKey(r.b) }} className="hover:text-primary">{r.b}</Link>
                </p>
                <p className="text-2xl text-primary">{r.aWins}-{r.bWins}{r.ties ? `-${r.ties}` : ""}</p>
              </div>
              <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="bg-primary" style={{ width: `${bar.a}%` }} />
                <div className="bg-muted-foreground/40" style={{ width: `${bar.t}%` }} />
                <div className="bg-secondary" style={{ width: `${bar.b}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {leader} · {r.games} games{r.playoffGames ? ` (${r.playoffGames} playoff)` : ""} · avg margin {r.avgMargin.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Points: {r.aPts.toFixed(1)} – {r.bPts.toFixed(1)} · Last: {r.last}</p>
            </div>
          );
        })}
      </div>
      {all.length > 0 && (
        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Trophy className="h-4 w-4 text-primary" /> Records count each week separately, so two-week playoff matchups count as two games.
        </p>
      )}
    </main>
  );
}
