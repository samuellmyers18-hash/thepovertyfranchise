import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimManager, getManagers, releaseManager } from "@/lib/league.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/managers")({
  head: () => ({
    meta: [
      { title: "Managers — The Poverty Franchise" },
      { name: "description", content: "Every manager in Poverty Franchise history. Claim yours." },
      { property: "og:title", content: "Managers — The Poverty Franchise" },
      { property: "og:description", content: "Every manager in Poverty Franchise history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManagersPage,
});

function ManagersPage() {
  const fetchManagers = useServerFn(getManagers);
  const claim = useServerFn(claimManager);
  const release = useServerFn(releaseManager);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers() });

  async function onClaim(key: string, name: string) {
    const r = await claim({ data: { key, name } });
    if (!r.ok) toast.error(r.error);
    else toast.success(`You're now ${name}`);
    qc.invalidateQueries({ queryKey: ["managers"] });
  }
  async function onRelease(key: string) {
    await release({ data: { key } });
    qc.invalidateQueries({ queryKey: ["managers"] });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-5xl text-foreground">Managers</h1>
      <p className="mt-2 text-muted-foreground">Everyone who has ever managed in the league, past and present. Claim the one that's you.</p>
      {isLoading && <p className="mt-8 text-muted-foreground">Loading every season from ESPN…</p>}
      {data?.error && <p className="mt-8 text-destructive">{data.error}</p>}
      <div className="mt-8 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>{["Manager", "Seasons", "Record", "Titles", "Points for", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data?.managers.map((m) => {
              const mine = m.claimedBy === data.userId;
              return (
                <tr key={m.key} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold text-foreground">{m.name}{mine && <Badge className="ml-2">You</Badge>}</td>
                  <td className="px-3 py-2">{m.seasons.map((s) => s.season).sort().join(", ")}</td>
                  <td className="px-3 py-2">{m.wins}-{m.losses}{m.ties ? `-${m.ties}` : ""}</td>
                  <td className="px-3 py-2">{m.championships}</td>
                  <td className="px-3 py-2">{m.pointsFor.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">
                    {mine ? (
                      <Button size="sm" variant="secondary" onClick={() => onRelease(m.key)}>Unclaim</Button>
                    ) : m.claimedBy ? (
                      <span className="text-xs text-muted-foreground">Claimed</span>
                    ) : !data.myClaim ? (
                      <Button size="sm" onClick={() => onClaim(m.key, m.name)}>This is me</Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data?.myClaim && <Link to="/profile" className="mt-6 inline-block text-primary underline">Go to my profile →</Link>}
    </main>
  );
}
