import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getManagers } from "@/lib/league.functions";
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
  if (isLoading) return <p className="px-6 py-10 text-muted-foreground">Loading…</p>;
  if (data?.myClaim) return <Navigate to="/managers/$key" params={{ key: data.myClaim }} replace />;
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-5xl text-foreground">No manager claimed yet</h1>
      <p className="mt-2 text-muted-foreground">Claim your name to get your own profile.</p>
      <Button asChild className="mt-6"><Link to="/claim">Claim my manager</Link></Button>
    </main>
  );
}
