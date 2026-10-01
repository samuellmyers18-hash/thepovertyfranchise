import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getDraft } from "@/lib/league.functions";

export const Route = createFileRoute("/_authenticated/drafts")({
  head: () => ({
    meta: [
      { title: "Draft recaps — The Poverty Franchise" },
      { name: "description", content: "Every pick from every Poverty Franchise draft." },
      { property: "og:title", content: "Draft recaps — The Poverty Franchise" },
      { property: "og:description", content: "Every pick from every Poverty Franchise draft." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DraftsPage,
});

function DraftsPage() {
  const fetchDraft = useServerFn(getDraft);
  const [season, setSeason] = useState<number | undefined>();
  const { data, isLoading } = useQuery({ queryKey: ["draft", season], queryFn: () => fetchDraft({ data: { season } }), staleTime: 10 * 60_000 });
  const rounds = new Map<number, NonNullable<typeof data>["picks"]>();
  for (const p of data?.picks ?? []) rounds.set(p.round, [...(rounds.get(p.round) ?? []), p]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-5xl text-foreground">Draft recaps</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {data?.years.map((y) => (
          <button key={y} onClick={() => setSeason(y)} className={`rounded-md px-3 py-1 text-sm ${y === data.season ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{y}</button>
        ))}
      </div>
      {isLoading && <p className="mt-8 text-muted-foreground">Loading the draft board…</p>}
      {data?.error && !data.picks.length && <p className="mt-8 text-destructive">{data.error}</p>}
      {data && data.picks.length > 0 && (
        <p className="mt-6 text-muted-foreground">
          {data.season} draft · {data.picks.length} picks · first overall: <span className="text-primary">{data.picks[0]!.player}</span> to {data.picks[0]!.managers || data.picks[0]!.team}
        </p>
      )}
      <div className="mt-6 space-y-6">
        {[...rounds.entries()].map(([round, picks]) => (
          <section key={round}>
            <h2 className="mb-2 text-2xl text-foreground">Round {round}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {picks.map((p) => (
                <div key={p.overall} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <span className="text-muted-foreground">#{p.overall}</span> <span className="font-semibold text-foreground">{p.player}</span>
                  {p.keeper && <span className="ml-1 text-xs text-primary">keeper</span>}
                  <span className="block text-xs text-muted-foreground">{p.managers || p.team}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
