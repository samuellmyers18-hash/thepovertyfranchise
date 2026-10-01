import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAwards } from "@/lib/history.functions";
import { ManagerNames } from "@/components/LeagueHome";

const DESC = "Season-by-season awards for The Poverty Franchise: champions, the Sacko, luckiest, unluckiest and more.";
export const Route = createFileRoute("/_authenticated/awards")({
  head: () => ({
    meta: [
      { title: "Season Awards — The Poverty Franchise" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Season Awards — The Poverty Franchise" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AwardsPage,
});

function AwardsPage() {
  const fetchAwards = useServerFn(getAwards);
  const [season, setSeason] = useState<number | undefined>();
  const { data, isLoading } = useQuery({ queryKey: ["awards", season ?? "latest"], queryFn: () => fetchAwards({ data: { season } }) });
  const [hero, ...rest] = data?.awards ?? [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">The Poverty Franchise</p>
      <h1 className="mb-6 text-6xl text-foreground">{data?.season ?? ""} Awards</h1>
      <div className="mb-8 flex flex-wrap gap-2">
        {(data?.years ?? []).map((y) => (
          <button key={y} onClick={() => setSeason(y)}
            className={`rounded-md border px-3 py-1.5 text-sm ${data?.season === y ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
            {y}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-muted-foreground">Polishing the trophies…</p>}
      {data?.error && <p className="text-destructive">{data.error}</p>}
      {hero && (
        <section className="mb-6 rounded-xl border border-primary bg-primary/10 p-8 text-center">
          <p className="text-6xl">{hero.emoji}</p>
          <p className="mt-2 text-sm uppercase tracking-[0.3em] text-primary">{hero.title}</p>
          {hero.team && <p className="mt-2 text-xl text-muted-foreground">{hero.team}</p>}
          <ManagerNames names={hero.who} className="text-5xl text-foreground" />
          <p className="mt-1 text-muted-foreground">{hero.detail}</p>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((a) => (
          <div key={a.title} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{a.emoji}</span>
              <p className="text-xs uppercase tracking-[0.2em] text-primary">{a.title}</p>
            </div>
            {a.team && <p className="mt-3 text-sm uppercase tracking-wider text-muted-foreground">{a.team}</p>}
            <ManagerNames names={a.who} className="block text-2xl text-foreground" />
            <p className="text-sm text-muted-foreground">{a.detail}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
