import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimManager, getManagers, releaseManager } from "@/lib/league.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/claim")({
  head: () => ({
    meta: [
      { title: "Claim your manager — The Poverty Franchise" },
      { name: "description", content: "Link your account to your manager in The Poverty Franchise." },
      { property: "og:title", content: "Claim your manager — The Poverty Franchise" },
      { property: "og:description", content: "Link your account to your manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const fetchManagers = useServerFn(getManagers);
  const claim = useServerFn(claimManager);
  const release = useServerFn(releaseManager);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers() });
  const mine = data?.managers.find((m) => m.key === data.myClaim);

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-5xl text-foreground">Claim your manager</h1>
      {isLoading && <p className="mt-8 text-muted-foreground">Loading managers…</p>}
      {data?.error && <p className="mt-8 text-destructive">{data.error}</p>}
      {mine ? (
        <div className="mt-6 rounded-md border border-border bg-card p-6">
          <p className="text-muted-foreground">You're linked to</p>
          <p className="text-4xl text-primary">{mine.name}</p>
          <div className="mt-4 flex gap-3">
            <Button asChild><Link to="/managers/$key" params={{ key: mine.key }}>View my profile</Link></Button>
            <Button variant="secondary" onClick={() => onRelease(mine.key)}>That's not me</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">Find your name and tap "This is me". Each manager can only be claimed once.</p>
          <div className="mt-6 divide-y divide-border rounded-md border border-border">
            {data?.managers.map((m) => (
              <div key={m.key} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.seasons.map((s) => s.season).sort().join(", ")}</p>
                </div>
                {m.claimedBy ? <span className="text-xs text-muted-foreground">Claimed</span> : <Button size="sm" onClick={() => onClaim(m.key, m.name)}>This is me</Button>}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
