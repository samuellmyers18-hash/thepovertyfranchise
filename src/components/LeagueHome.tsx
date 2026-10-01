import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLeagueHome } from "@/lib/league.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, TrendingUp, Flame, Trophy, BarChart3 } from "lucide-react";

const th = "px-3 py-2 text-left";

function TrendChart({ trend }: { trend: { week: number; avg: number; high: number; highWho: string }[] }) {
  const max = Math.max(1, ...trend.map((t) => t.high));
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1 pt-6">
      {trend.map((t) => (
        <div key={t.week} className="group relative flex min-w-8 flex-1 flex-col items-center justify-end gap-1">
          <div className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow group-hover:block">
            Wk {t.week}: avg {t.avg.toFixed(1)} · high {t.high.toFixed(1)} ({t.highWho})
          </div>
          <div className="w-full rounded-t bg-primary/25" style={{ height: `${(t.high / max) * 140}px` }} />
          <div className="-mt-[inherit] w-full rounded-t bg-primary" style={{ height: `${(t.avg / max) * 140}px`, marginTop: `-${(t.high / max) * 140}px` }} />
          <span className="text-[10px] text-muted-foreground">{t.week}</span>
        </div>
      ))}
    </div>
  );
}

export function LeagueHome() {
  const fetchHome = useServerFn(getLeagueHome);
  const { data, isLoading } = useQuery({ queryKey: ["league-home"], queryFn: () => fetchHome(), staleTime: 5 * 60_000 });

  if (isLoading) return <p className="mt-12 text-muted-foreground">Pulling the latest from ESPN…</p>;
  if (!data || (data.error && !data.standings.length)) return <p className="mt-12 text-destructive">{data?.error}</p>;

  const heroFact = data.facts.find((f) => f.title === "Highest score ever");
  const restFacts = data.facts.filter((f) => f !== heroFact);
  const maxPts = Math.max(1, ...data.pointsLeaders.map((p) => p.pts));
  const maxTop = Math.max(1, ...data.topScores.map((t) => t.pts));

  return (
    <div className="mt-12 space-y-12">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">
        {data.season} season · through week {data.week}
      </p>

      {heroFact && (
        <section className="relative overflow-hidden rounded-lg border border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-8">
          <Flame className="absolute -right-6 -top-6 h-40 w-40 text-primary/10" />
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">League record</p>
          <p className="mt-2 text-7xl font-black text-foreground sm:text-8xl">{heroFact.value}</p>
          <p className="mt-2 text-lg text-muted-foreground">{heroFact.detail}</p>
        </section>
      )}

      <section>
        <h2 className="text-4xl text-foreground">Power rankings</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          40% all-play record (how you'd do vs. everyone each week), 30% actual record, 30% scoring over the last 3 weeks.
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground"><tr>{["#", "Team", "Score", "Record", "All-play", "Last 3 avg", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.power.map((p) => (
                <tr key={p.teamId} className="border-t border-border">
                  <td className="px-3 py-2 text-2xl text-primary">{p.rank}</td>
                  <td className="px-3 py-2"><span className="font-semibold text-foreground">{p.team}</span><span className="block text-xs text-muted-foreground">{p.managers}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${(p.score / (data.power[0]?.score || 1)) * 100}%` }} />
                      </div>
                      {p.score}
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.wins}-{p.losses}{p.ties ? `-${p.ties}` : ""}</td>
                  <td className="px-3 py-2">{p.allPlay}</td>
                  <td className="px-3 py-2">{p.recentAvg.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs text-primary">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-4xl text-foreground">Standings</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground"><tr>{["", "Team", "W-L", "PF", "PA", "Streak"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.standings.map((s, i) => (
                <tr key={s.teamId} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2"><span className="font-semibold text-foreground">{s.team}</span><span className="block text-xs text-muted-foreground">{s.managers}</span></td>
                  <td className="px-3 py-2">{s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ""}</td>
                  <td className="px-3 py-2">{s.pf.toFixed(1)}</td>
                  <td className="px-3 py-2">{s.pa.toFixed(1)}</td>
                  <td className="px-3 py-2">{s.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.trend.length > 1 && (
        <section>
          <h2 className="flex items-center gap-2 text-4xl text-foreground"><TrendingUp className="h-7 w-7 text-primary" /> Scoring by week</h2>
          <p className="mb-4 text-sm text-muted-foreground">Solid bars are the league average each week; the lighter cap is the week's highest score. Hover a bar for details.</p>
          <div className="rounded-md border border-border bg-card p-4">
            <TrendChart trend={data.trend} />
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-3xl text-foreground"><Trophy className="h-6 w-6 text-primary" /> Highest weeks ever</h2>
          <div className="mt-4 space-y-3">
            {data.topScores.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 text-xl font-black text-primary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{t.who}</span>
                    <span className="text-sm font-bold text-foreground">{t.pts.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(t.pts / maxTop) * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.season} · week {t.week}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-3xl text-foreground"><BarChart3 className="h-6 w-6 text-primary" /> Career points leaders</h2>
          <div className="mt-4 space-y-3">
            {data.pointsLeaders.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-6 text-xl font-black text-primary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{p.name}</span>
                    <span className="text-sm font-bold text-foreground">{p.pts.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-secondary-foreground/70" style={{ width: `${(p.pts / maxPts) * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.seasons} season{p.seasons === 1 ? "" : "s"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-4xl text-foreground"><Crown className="h-7 w-7 text-primary" /> More fun facts</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {restFacts.map((f) => (
            <Card key={f.title}><CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{f.title}</p>
              <p className="text-3xl text-primary">{f.value}</p>
              <p className="text-sm text-foreground">{f.detail}</p>
            </CardContent></Card>
          ))}
        </div>
      </section>
    </div>
  );
}
