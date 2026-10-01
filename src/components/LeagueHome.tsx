import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getLeagueHome, type MatchupRow } from "@/lib/league.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, TrendingUp, Flame, Trophy, BarChart3, Star, CalendarDays, ArrowLeftRight } from "lucide-react";

const th = "px-3 py-2 text-left";
const mKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

/** Render "A & B" manager strings as profile links. */
export function ManagerNames({ names, className }: { names: string; className?: string }) {
  const parts = names.split(" & ").map((s) => s.trim()).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((n, i) => (
        <span key={n}>
          {i > 0 && " & "}
          <Link to="/managers/$key" params={{ key: mKey(n) }} className="hover:text-primary hover:underline">{n}</Link>
        </span>
      ))}
    </span>
  );
}

function MatchupCard({ m, big }: { m: MatchupRow; big?: boolean }) {
  const homeWon = m.homePts > m.awayPts;
  const tied = m.homePts === m.awayPts;
  return (
    <div className={`rounded-md border bg-card ${big ? "border-primary/50 p-6" : "border-border p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold ${homeWon && !tied ? "text-primary" : "text-foreground"} ${big ? "text-xl" : ""}`}>{m.homeTeam}</p>
          <ManagerNames names={m.homeManagers.join(" & ")} className="text-xs text-muted-foreground" />
        </div>
        <p className={`${big ? "text-4xl" : "text-2xl"} font-black ${homeWon && !tied ? "text-primary" : "text-foreground"}`}>{m.homePts.toFixed(1)}</p>
      </div>
      <div className="my-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span className="h-px flex-1 bg-border" />vs<span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold ${!homeWon && !tied ? "text-primary" : "text-foreground"} ${big ? "text-xl" : ""}`}>{m.awayTeam}</p>
          <ManagerNames names={m.awayManagers.join(" & ")} className="text-xs text-muted-foreground" />
        </div>
        <p className={`${big ? "text-4xl" : "text-2xl"} font-black ${!homeWon && !tied ? "text-primary" : "text-foreground"}`}>{m.awayPts.toFixed(1)}</p>
      </div>
    </div>
  );
}

function TrendChart({ trend }: { trend: { week: number; avg: number; high: number; highWho: string }[] }) {
  const max = Math.max(1, ...trend.map((t) => t.high));
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1 pt-6">
      {trend.map((t) => (
        <div key={t.week} className="group relative flex min-w-8 flex-1 flex-col items-center justify-end gap-1">
          <div className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow group-hover:block">
            Wk {t.week}: avg {t.avg.toFixed(1)} · high {t.high.toFixed(1)} ({t.highWho})
          </div>
          <div className="flex w-full flex-col justify-end" style={{ height: "150px" }}>
            <div className="w-full rounded-t bg-primary/25" style={{ height: `${(t.high / max) * 100}%` }} />
            <div className="w-full bg-primary" style={{ height: `${(t.avg / max) * 100}%`, marginTop: `-${(t.avg / max) * 150}px` }} />
          </div>
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

      {data.featured && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-4xl text-foreground"><Star className="h-7 w-7 text-primary" /> Featured matchup</h2>
          <p className="mb-4 text-sm text-muted-foreground">Week {data.week}'s highest-scoring battle.</p>
          <MatchupCard m={data.featured} big />
        </section>
      )}

      {data.matchups.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-4xl text-foreground"><CalendarDays className="h-7 w-7 text-primary" /> Week {data.week} matchups</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.matchups.map((m, i) => <MatchupCard key={i} m={m} />)}
          </div>
        </section>
      )}

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
                  <td className="px-3 py-2"><span className="font-semibold text-foreground">{p.team}</span><ManagerNames names={p.managers} className="block text-xs text-muted-foreground" /></td>
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
                  <td className="px-3 py-2"><span className="font-semibold text-foreground">{s.team}</span><ManagerNames names={s.managers} className="block text-xs text-muted-foreground" /></td>
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
                    <ManagerNames names={t.who} className="truncate font-semibold text-foreground" />
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
                    <Link to="/managers/$key" params={{ key: mKey(p.name) }} className="truncate font-semibold text-foreground hover:text-primary hover:underline">{p.name}</Link>
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

      {data.moves.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-4xl text-foreground"><ArrowLeftRight className="h-7 w-7 text-primary" /> Recent moves</h2>
          <div className="divide-y divide-border rounded-md border border-border bg-card">
            {data.moves.map((mv, i) => (
              <div key={i} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mv.kind === "Trade" ? "bg-primary/20 text-primary" : mv.kind === "Waiver" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>{mv.kind}</span>
                    <span className="font-semibold text-foreground">{mv.players}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mv.team}
                    {mv.managers.length > 0 && <> · <ManagerNames names={mv.managers.join(" & ")} /></>}
                    {mv.bid != null && mv.bid > 0 && ` · $${mv.bid} bid`}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{mv.date}</span>
              </div>
            ))}
          </div>
        </section>
      )}

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
