import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRecords } from "@/lib/history.functions";
import { ManagerNames } from "@/components/LeagueHome";

const DESC = "All-time league records for The Poverty Franchise: top scores, blowouts, streaks and titles.";
export const Route = createFileRoute("/_authenticated/records")({
  head: () => ({
    meta: [
      { title: "League Records — The Poverty Franchise" },
      { name: "description", content: DESC },
      { property: "og:title", content: "League Records — The Poverty Franchise" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const fetchRecords = useServerFn(getRecords);
  const { data, isLoading } = useQuery({ queryKey: ["records"], queryFn: () => fetchRecords() });
  const [year, setYear] = useState<number | "all">("all");
  const years = [...new Set((data?.cats ?? []).flatMap((c) => c.entries.map((e) => e.season)))].filter(Boolean).sort((a, b) => b - a);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">The Poverty Franchise</p>
      <h1 className="mb-6 text-6xl text-foreground">Record book</h1>
      {years.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {(["all", ...years] as const).map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`rounded-md border px-3 py-1.5 text-sm ${year === y ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
              {y === "all" ? "All time" : `Set in ${y}`}
            </button>
          ))}
        </div>
      )}
      {isLoading && <p className="text-muted-foreground">Opening the record book…</p>}
      {data?.error && <p className="text-destructive">{data.error}</p>}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {(data?.cats ?? []).map((c) => {
          const entries = c.entries.filter((e) => year === "all" || e.season === year);
          if (!entries.length) return null;
          const [first, ...rest] = entries;
          return (
            <section key={c.title} className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-2xl text-foreground">{c.title}</h2>
              <p className="mb-4 text-xs text-muted-foreground">{c.blurb}</p>
              <div className="mb-3 rounded-md bg-primary/10 p-3">
                <p className="text-4xl text-primary">{first!.value}</p>
                <ManagerNames names={first!.who} className="font-semibold text-foreground" />
                <p className="text-xs text-muted-foreground">{first!.detail}</p>
              </div>
              <ol className="space-y-2 text-sm">
                {rest.map((e, i) => (
                  <li key={i} className="flex gap-3 border-t border-border/50 pt-2">
                    <span className="w-5 text-muted-foreground">{i + 2}</span>
                    <div className="flex-1">
                      <ManagerNames names={e.who} className="text-foreground" />
                      <p className="text-xs text-muted-foreground">{e.detail}</p>
                    </div>
                    <span className="font-semibold text-foreground">{e.value}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </main>
  );
}
