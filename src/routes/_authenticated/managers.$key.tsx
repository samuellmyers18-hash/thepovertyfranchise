import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getManagerProfile, getRosters } from "@/lib/league.functions";
import { ManagerDNA } from "@/components/ManagerDNA";
import { ManagerStats } from "@/components/ManagerStats";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/managers/$key")({
  head: () => ({
    meta: [
      { title: "Manager profile — The Poverty Franchise" },
      { name: "description", content: "Career stats and fun facts for a Poverty Franchise manager." },
      { property: "og:title", content: "Manager profile — The Poverty Franchise" },
      { property: "og:description", content: "Career stats and fun facts for a Poverty Franchise manager." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManagerPage,
});

function ManagerPage() {
  const { key } = Route.useParams();
  const fetchProfile = useServerFn(getManagerProfile);
  const fetchRosters = useServerFn(getRosters);
  const { data, isLoading } = useQuery({ queryKey: ["manager", key], queryFn: () => fetchProfile({ data: { key } }) });
  const { data: rosterData } = useQuery({ queryKey: ["rosters", "latest", "latest"], queryFn: () => fetchRosters({ data: {} }) });
  const myRoster = data?.manager && rosterData?.teams
    ? rosterData.teams.find((t) => t.managers.some((n) => n.trim().toLowerCase().replace(/\s+/g, " ") === key))
    : undefined;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/managers" className="text-sm text-muted-foreground hover:text-primary">← All managers</Link>
      {isLoading ? (
        <p className="mt-6 text-muted-foreground">Loading profile…</p>
      ) : !data?.manager ? (
        <p className="mt-6 text-destructive">{data?.error ?? "Manager not found."}</p>
      ) : (
        <>
          <p className="mt-6 text-sm uppercase tracking-[0.3em] text-primary">Manager profile{data.claimed ? "" : " · unclaimed"}</p>
          <h1 className="mb-8 text-6xl text-foreground">{data.manager.name}</h1>
          {data.dna && <ManagerDNA dna={data.dna} />}
          <ManagerStats m={data.manager} />
          {myRoster && (
            <>
              <h2 className="mb-4 mt-12 text-4xl text-foreground">Current roster</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                {myRoster.team} · {rosterData?.season} week {rosterData?.week} ·{" "}
                <Link to="/rosters" className="text-primary hover:underline">See all rosters and past weeks →</Link>
              </p>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full text-sm">
                  <tbody>
                    {myRoster.players.map((p, i) => (
                      <tr key={i} className="border-t border-border/50 first:border-0">
                        <td className="w-16 px-4 py-1.5 text-xs font-bold uppercase text-muted-foreground">{p.slot}</td>
                        <td className="px-2 py-1.5 text-foreground">{p.name}</td>
                        <td className="px-4 py-1.5 text-right text-xs text-muted-foreground">{p.acquired ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <h2 className="mb-4 mt-12 text-4xl text-foreground">Fun facts</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.facts.map((f) => (
              <Card key={f.title}><CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{f.title}</p>
                <p className="text-3xl text-primary">{f.value}</p>
                <p className="text-sm text-foreground">{f.detail}</p>
              </CardContent></Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
