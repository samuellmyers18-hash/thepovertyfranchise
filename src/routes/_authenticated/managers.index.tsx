import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getManagers } from "@/lib/league.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/managers/")({
  head: () => ({
    meta: [
      { title: "Managers — The Poverty Franchise" },
      { name: "description", content: "Every manager in Poverty Franchise history, with career stats." },
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
  const { data, isLoading } = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers() });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-5xl text-foreground">Managers</h1>
      <p className="mt-2 text-muted-foreground">Everyone who has ever managed in the league, past and present. Tap a name to see their profile.</p>
      {isLoading && <p className="mt-8 text-muted-foreground">Loading every season from ESPN…</p>}
      {data?.error && <p className="mt-8 text-destructive">{data.error}</p>}
      <div className="mt-8 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>{["Manager", "Seasons", "Record", "Titles", "Points for"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data?.managers.map((m) => (
              <tr key={m.key} className="border-t border-border hover:bg-secondary/50">
                <td className="px-3 py-2">
                  <Link to="/managers/$key" params={{ key: m.key }} className="font-semibold text-foreground hover:text-primary">{m.name}</Link>
                  {m.claimedBy === data.userId && <Badge className="ml-2">You</Badge>}
                </td>
                <td className="px-3 py-2">{m.seasons.length}</td>
                <td className="px-3 py-2">{m.wins}-{m.losses}{m.ties ? `-${m.ties}` : ""}</td>
                <td className="px-3 py-2">{m.championships}</td>
                <td className="px-3 py-2">{m.pointsFor.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
