import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRosters } from "@/lib/league.functions";
import { ManagerNames } from "@/components/LeagueHome";

export const Route = createFileRoute("/_authenticated/rosters")({
  head: () => ({
    meta: [
      { title: "Rosters — The Poverty Franchise" },
      { name: "description", content: "Every team's roster, week by week, across every Poverty Franchise season." },
      { property: "og:title", content: "Rosters — The Poverty Franchise" },
      { property: "og:description", content: "Every team's roster, week by week, across every Poverty Franchise season." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RostersPage,
});

function RostersPage() {
  const fetchRosters = useServerFn(getRosters);
  const [season, setSeason] = useState<number | undefined>(undefined);
  const [week, setWeek] = useState<number | undefined>(undefined);
  const { data, isLoading } = useQuery({
    queryKey: ["rosters", season ?? "latest", week ?? "latest"],
    queryFn: () => fetchRosters({ data: { season, week } }),
  });

  const sel = "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">The Poverty Franchise</p>
      <h1 className="mb-6 text-6xl text-foreground">Rosters</h1>

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
        <p className="text-muted-foreground">Loading rosters…</p>
      ) : !data || data.teams.length === 0 ? (
        <p className="text-destructive">{data?.error ?? "No rosters found for that week."}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.teams.map((t) => (
            <div key={t.teamId} className="rounded-md border border-border bg-card">
              <div className="border-b border-border p-4">
                <p className="text-2xl text-foreground">{t.team}</p>
                {t.managers.length > 0 && <ManagerNames names={t.managers.join(" & ")} className="text-sm text-muted-foreground" />}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {t.players.map((p, i) => (
                    <tr key={i} className="border-t border-border/50 first:border-0">
                      <td className="w-16 px-4 py-1.5 text-xs font-bold uppercase text-muted-foreground">{p.slot}</td>
                      <td className="px-2 py-1.5 text-foreground">{p.name}</td>
                      <td className="px-4 py-1.5 text-right text-xs text-muted-foreground">{p.acquired ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm text-muted-foreground"><Link to="/" className="hover:text-primary">← Home</Link></p>
    </main>
  );
}
