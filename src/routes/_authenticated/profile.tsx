import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getManagers } from "@/lib/league.functions";
import { ManagerStats } from "@/components/ManagerStats";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — The Poverty Franchise" },
      { name: "description", content: "Your career stats in The Poverty Franchise." },
      { property: "og:title", content: "My profile — The Poverty Franchise" },
      { property: "og:description", content: "Your career stats in The Poverty Franchise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchManagers = useServerFn(getManagers);
  const { data, isLoading } = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers() });
  const me = data?.managers.find((m) => m.key === data.myClaim);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {isLoading ? (
        <p className="text-muted-foreground">Loading your stats…</p>
      ) : me ? (
        <>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Manager profile</p>
          <h1 className="mb-8 text-6xl text-foreground">{me.name}</h1>
          <ManagerStats m={me} />
        </>
      ) : (
        <div>
          <h1 className="text-5xl text-foreground">No manager claimed yet</h1>
          <p className="mt-2 text-muted-foreground">Pick your name from the list to see your stats.</p>
          <Button asChild className="mt-6"><Link to="/managers">Claim my manager</Link></Button>
        </div>
      )}
    </main>
  );
}
