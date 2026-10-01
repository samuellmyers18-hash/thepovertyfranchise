import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

function Score({ a, b }: { a: { managers: string; pts: number }; b: { managers: string; pts: number } }) {
  return (
    <p className="text-xs uppercase tracking-wider text-muted-foreground">
      <ManagerNames names={a.managers} /> {a.pts.toFixed(2)} · <ManagerNames names={b.managers} /> {b.pts.toFixed(2)}
    </p>
  );
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
                <Box label="Player of the week" who={iss.topScorer.who} text={`${iss.topScorer.pts.toFixed(2)} points — the week's best.`} />
                <Box label="Bust of the week" who={iss.bust.who} text={`Just ${iss.bust.pts.toFixed(2)} points. Yikes.`} />
                {iss.unluckiest && <Box label="Hard luck" who={iss.unluckiest.who} text={`Scored ${iss.unluckiest.pts.toFixed(2)} and still lost.`} />}
                {iss.luckiest && <Box label="Stole one" who={iss.luckiest.who} text={`Won with only ${iss.luckiest.pts.toFixed(2)}.`} />}
              </aside>
            </section>

            <section className="border-b border-border py-6">
              <p className="mb-2 text-xs uppercase tracking-widest text-primary">From the editor's desk</p>
              <p className="italic text-foreground">{iss.editorial}</p>
              <p className="mt-2 text-sm text-muted-foreground">League average {iss.avg.toFixed(1)} · season average {iss.seasonAvg.toFixed(1)} · {iss.moves} roster moves so far this season.</p>
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
                        <td className="py-1"><ManagerNames names={r.managers} className="text-foreground" /></td>
                        <td className="py-1 text-right text-foreground">{r.w}-{r.l}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </aside>
            </section>
          </>
        )}
      </article>
    </main>
  );
}

function Box({ label, who, text }: { label: string; who: string; text: string }) {
  return (
    <div className="border-b border-border pb-3">
      <p className="text-xs uppercase tracking-widest text-primary">{label}</p>
      <ManagerNames names={who} className="text-2xl text-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
