import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { getNewsletter } from "@/lib/history.functions";
import { ManagerNames } from "@/components/LeagueHome";

const DESC = "The Poverty Post: a weekly newspaper of recaps, headlines and standings from The Poverty Franchise.";
export const Route = createFileRoute("/_authenticated/newsletter")({
  head: () => ({
    meta: [
      { title: "The Poverty Post — Weekly Newsletter" },
      { name: "description", content: DESC },
      { property: "og:title", content: "The Poverty Post — Weekly Newsletter" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsletterPage,
});

type S = { team: string; managers: string; pts: number };
function Who({ x, big }: { x: { team: string; managers: string }; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`${big ? "text-base" : "text-[11px]"} uppercase leading-snug tracking-wider text-primary`}>{x.team}</p>
      <ManagerNames names={x.managers} className={`mt-0.5 block leading-snug ${big ? "text-2xl text-foreground" : "text-sm text-foreground"}`} />
    </div>
  );
}
function Score({ a, b }: { a: S; b: S }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2"><Who x={a} /><span className="shrink-0 text-lg text-foreground">{a.pts.toFixed(2)}</span></div>
      <span>vs</span>
      <div className="flex min-w-0 items-center gap-2"><Who x={b} /><span className="shrink-0 text-lg text-foreground">{b.pts.toFixed(2)}</span></div>
    </div>
  );
}
function H({ children }: { children: ReactNode }) {
  return <p className="mb-3 border-b border-foreground/40 pb-1 text-xs uppercase tracking-widest text-primary">{children}</p>;
}

function NewsletterPage() {
  const fetchIssue = useServerFn(getNewsletter);
  const [season, setSeason] = useState<number | undefined>();
  const [week, setWeek] = useState<number | undefined>();
  const { data, isLoading } = useQuery({
    queryKey: ["newsletter", season ?? "latest", week ?? "latest"],
    queryFn: () => fetchIssue({ data: { season, week } }),
  });
  const sel = "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground";
  const iss = data?.issue;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {data && (
        <div className="mb-6 flex flex-wrap gap-3">
          <select className={sel} value={data.season ?? ""} onChange={(e) => { setSeason(Number(e.target.value)); setWeek(undefined); }}>
            {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={sel} value={data.week} onChange={(e) => setWeek(Number(e.target.value))}>
            {data.weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
      )}

      <article className="rounded-lg border border-border bg-card p-6 md:p-10">
        <header className="border-b-4 border-double border-foreground/60 pb-4 text-center">
          <div className="flex justify-between text-xs uppercase tracking-widest text-muted-foreground">
            <span>Vol. {iss?.volume ?? "—"}</span>
            <span>{data?.season ?? ""} Season · Week {data?.week ?? ""}</span>
            <span>Price: your dignity</span>
          </div>
          <h1 className="mt-2 text-6xl text-foreground md:text-8xl">The Poverty Post</h1>
          <p className="text-xs uppercase tracking-[0.4em] text-primary">All the news that's fit to trash-talk</p>
        </header>

        {isLoading && <p className="py-10 text-center text-muted-foreground">Stopping the presses…</p>}
        {data?.error && !iss && <p className="py-10 text-center text-destructive">{data.error}</p>}

        {iss && (
          <>
            <section className="grid gap-8 border-b border-border py-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-widest text-primary">Lead story</p>
                <h2 className="text-5xl leading-none text-foreground">{iss.lead.headline}</h2>
                <Score a={iss.lead.home} b={iss.lead.away} />
                <p className="mt-3 text-lg leading-relaxed text-foreground first-letter:float-left first-letter:mr-2 first-letter:text-6xl first-letter:text-primary">
                  {iss.lead.body}
                </p>
              </div>
              <aside className="space-y-4 border-border md:border-l md:pl-6">
                <Box label="Team of the week" who={iss.topScorer.who} team={iss.topScorer.team} text={`${iss.topScorer.pts.toFixed(2)} points — the week's best.`} />
                <Box label="Bust of the week" who={iss.bust.who} team={iss.bust.team} text={`Just ${iss.bust.pts.toFixed(2)} points. Yikes.`} />
                {iss.unluckiest && <Box label="Hard luck" who={iss.unluckiest.who} team={iss.unluckiest.team} text={`Scored ${iss.unluckiest.pts.toFixed(2)} and still lost.`} />}
                {iss.luckiest && <Box label="Stole one" who={iss.luckiest.who} team={iss.luckiest.team} text={`Won with only ${iss.luckiest.pts.toFixed(2)}.`} />}
              </aside>
            </section>

            <section className="border-b border-border py-6">
              <p className="mb-2 text-xs uppercase tracking-widest text-primary">From the editor's desk</p>
              <p className="italic text-foreground">{iss.editorial}</p>
              <p className="mt-2 text-sm text-muted-foreground">League average {iss.avg.toFixed(1)} · season average {iss.seasonAvg.toFixed(1)} · {iss.moves} roster moves so far this season.</p>
            </section>


            <section className="grid grid-cols-2 gap-4 border-b border-border py-6 md:grid-cols-6">
              {iss.byNumbers.map((b) => (
                <div key={b.label} className="text-center">
                  <p className="text-4xl text-foreground">{b.value}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{b.label}</p>
                </div>
              ))}
            </section>

            <section className="border-b border-border py-6">
              <H>Full scoreboard</H>
              <div className="grid gap-3 md:grid-cols-2">
                {iss.scoreboard.map((g, i) => (
                  <div key={i} className="rounded border border-border p-3">
                    {[g.home, g.away].map((x) => (
                      <div key={x.teamId} className="flex items-center justify-between py-1">
                        <Who x={x} />
                        <span className={`text-xl ${x.pts === Math.max(g.home.pts, g.away.pts) ? "text-primary" : "text-muted-foreground"}`}>{x.pts.toFixed(2)}</span>
                      </div>
                    ))}
                    <p className="mt-1 text-[11px] text-muted-foreground">All-time series: {g.aw}–{g.bw}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-6 py-6 md:grid-cols-3">
              <div className="grid gap-6 md:col-span-2 md:grid-cols-2">
                {iss.stories.map((s, i) => (
                  <div key={i} className="border-b border-border pb-4">
                    <h3 className="text-3xl leading-none text-foreground">{s.headline}</h3>
                    <Score a={s.home} b={s.away} />
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
              <aside className="md:border-l md:border-border md:pl-6">
                <p className="mb-2 text-xs uppercase tracking-widest text-primary">Standings through week {data?.week}</p>
                <table className="w-full text-sm">
                  <tbody>
                    {iss.standings.map((r, i) => (
                      <tr key={r.team} className="border-b border-border/50">
                        <td className="py-1 pr-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-1"><Who x={r} /></td>
                        <td className="py-1 text-right text-foreground">{r.w}-{r.l}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </aside>
            </section>

            <section className="grid gap-8 border-t border-border py-6 md:grid-cols-3">
              <div>
                <H>If everyone played everyone</H>
                <ol className="space-y-2 text-sm">
                  {iss.allPlay.map((x) => (
                    <li key={x.team} className="flex items-center justify-between"><Who x={x} /><span className="text-foreground">{x.w}-{x.l}</span></li>
                  ))}
                </ol>
              </div>
              <div>
                <H>Above &amp; below their norm</H>
                <ol className="space-y-2 text-sm">
                  {iss.movers.map((x) => (
                    <li key={x.team} className="flex items-center justify-between"><Who x={x} />
                      <span className={x.diff >= 0 ? "text-primary" : "text-destructive"}>{x.diff >= 0 ? "▲" : "▼"}{Math.abs(x.diff).toFixed(1)}</span></li>
                  ))}
                </ol>
              </div>
              <div>
                <H>Season scoring leaders</H>
                <ol className="space-y-2 text-sm">
                  {iss.leaders.map((x) => (
                    <li key={x.team} className="flex items-center justify-between"><Who x={x} />
                      <span className="text-right text-foreground">{x.avg.toFixed(1)}<span className="block text-[10px] text-muted-foreground">hi {x.hi.toFixed(0)} · lo {x.lo.toFixed(0)}</span></span></li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="grid gap-8 border-t border-border py-6 md:grid-cols-3">
              <div>
                <H>Streak watch</H>
                {iss.streaks.length === 0 && <p className="text-sm text-muted-foreground">No active streaks of 2+.</p>}
                <ol className="space-y-2 text-sm">
                  {iss.streaks.map((x) => (
                    <li key={x.team} className="flex items-center justify-between"><Who x={x} />
                      <span className={x.type === "W" ? "text-primary" : "text-destructive"}>{x.type}{x.n}</span></li>
                  ))}
                </ol>
              </div>
              <div className="md:col-span-2">
                <H>The gossip column</H>
                <ul className="space-y-3">
                  {iss.gossip.map((g, i) => <li key={i} className="border-l-2 border-primary pl-3 italic text-foreground">{g}</li>)}
                </ul>
              </div>
            </section>

            {iss.preview.length > 0 && (
              <section className="border-t-4 border-double border-foreground/60 py-6">
                <H>Next week: week {iss.nextWeek} preview</H>
                <div className="grid gap-4 md:grid-cols-2">
                  {iss.preview.map((p, i) => (
                    <div key={i} className="rounded border border-border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div><Who x={p.home} /><p className="text-xs text-muted-foreground">{p.home.rec} · {p.home.avg.toFixed(1)}/wk</p></div>
                        <span className="text-muted-foreground">vs</span>
                        <div className="text-right"><Who x={p.away} /><p className="text-xs text-muted-foreground">{p.away.rec} · {p.away.avg.toFixed(1)}/wk</p></div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">All-time: {p.h2h.aw}–{p.h2h.bw} · <span className="text-primary">Post pick: {p.pick}</span></p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </article>
    </main>
  );
}

function Box({ label, who, team, text }: { label: string; who: string; team: string; text: string }) {
  return (
    <div className="border-b border-border pb-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <Who x={{ team, managers: who }} big />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
