import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { connectEspn, disconnectEspn, getEspnStatus, getIsAdmin, getLeagueTeams, saveManagerName, saveTeamName } from "@/lib/espn.functions";
import { getManagers } from "@/lib/league.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — The Poverty Franchise" },
      { name: "description", content: "Connect your ESPN account so league history can be pulled in." },
      { property: "og:title", content: "Admin — The Poverty Franchise" },
      { property: "og:description", content: "Connect your ESPN account to The Poverty Franchise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectPage,
  errorComponent: () => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-muted-foreground">This page didn't load. Refresh to try again.</p>
    </main>
  ),
});

function AdminTools() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getEspnStatus);
  const saveConnection = useServerFn(connectEspn);
  const removeConnection = useServerFn(disconnectEspn);

  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [leagueId, setLeagueId] = useState("");

  const status = useQuery({
    queryKey: ["espn-status"],
    queryFn: () => fetchStatus({ data: undefined }),
  });

  const save = useMutation({
    mutationFn: () => saveConnection({ data: { swid, espnS2, leagueId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't connect to ESPN.", { duration: 10000 });
        return;
      }
      toast.success("ESPN connected.");
      setSwid("");
      setEspnS2("");
      queryClient.invalidateQueries({ queryKey: ["espn-status"] });
    },
    onError: () => toast.error("Couldn't reach ESPN. Try again in a moment."),
  });

  const remove = useMutation({
    mutationFn: () => removeConnection({ data: undefined }),
    onSuccess: () => {
      toast.success("ESPN disconnected.");
      queryClient.invalidateQueries({ queryKey: ["espn-status"] });
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const leagues = status.data?.leagues ?? [];

  return (
    <main className="field-grid min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Admin</p>
            <h1 className="mt-2 text-4xl text-foreground">Connect ESPN</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>

        <p className="mt-5 text-muted-foreground">
          ESPN doesn't let outside sites log in with an email and password. Instead, it hands your browser two
          access values once you're already logged in at fantasy.espn.com. Paste those here and the site can read
          your league on your behalf.
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-2xl">Where to find them</CardTitle>
            <CardDescription>Takes about a minute on a computer.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Log in at fantasy.espn.com in Chrome and open your league. Copy the number after{" "}
                <span className="text-foreground">leagueId=</span> in the address bar (or paste the whole link).
              </li>
              <li>Press F12 (or right-click → Inspect) to open developer tools.</li>
              <li>Open the “Application” tab, then Cookies → https://fantasy.espn.com.</li>
              <li>
                Find the rows named <span className="text-foreground">SWID</span> and{" "}
                <span className="text-foreground">espn_s2</span> and copy each value.
              </li>
              <li>Paste them below. They're stored privately and only used to read your league.</li>
            </ol>
          </CardContent>
        </Card>

        {status.data?.connected && (
          <Card className="mt-6 border-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                Connected
                <Badge>{status.data.espnDisplayName ?? "ESPN account"}</Badge>
              </CardTitle>
              <CardDescription>
                {leagues.length > 0
                  ? `${leagues.length} fantasy team${leagues.length === 1 ? "" : "s"} found on this account.`
                  : "Connected, but no fantasy teams came back. Your values may have expired — paste fresh ones below."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {leagues.map((league) => (
                <div
                  key={`${league.leagueId}-${league.seasonId}`}
                  className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3"
                >
                  <div>
                    <p className="text-foreground">{league.leagueName}</p>
                    <p className="text-sm text-muted-foreground">
                      {league.teamName ?? "Your team"} · League {league.leagueId}
                    </p>
                  </div>
                  <Badge variant="secondary">{league.seasonId || "—"}</Badge>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Disconnect ESPN
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-2xl">
              {status.data?.connected ? "Update your values" : "Paste your values"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="league_id">League ID</Label>
                <Input
                  id="league_id"
                  value={leagueId}
                  onChange={(e) => setLeagueId(e.target.value)}
                  placeholder="The number after leagueId= in your league's web address"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="swid">SWID</Label>
                <Input
                  id="swid"
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  placeholder="{ABCD1234-...}"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="espn_s2">espn_s2</Label>
                <Input
                  id="espn_s2"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  placeholder="AEB..."
                  required
                />
              </div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Checking with ESPN…" : "Connect ESPN"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {status.data?.connected && <TeamNamesCard />}
        {status.data?.connected && <ManagerNamesCard />}
      </div>
    </main>
  );
}

function ManagerNamesCard() {
  const fetchManagers = useServerFn(getManagers);
  const save = useServerFn(saveManagerName);
  const queryClient = useQueryClient();
  const managers = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers({ data: undefined }) });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function handleSave(key: string, value: string) {
    setSavingKey(key);
    try {
      const res = await save({ data: { managerKey: key, name: value } });
      if (!res.ok) toast.error(res.error ?? "Couldn't save.");
      else {
        toast.success(value.trim() ? "Manager name saved." : "Reset to ESPN name.");
        setDrafts((d) => ({ ...d, [key]: "" }));
        await queryClient.invalidateQueries();
      }
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-2xl">Manager names</CardTitle>
        <CardDescription>
          Rename any manager, including past ones. The new name shows everywhere — profiles, rivalries, history.
          Leave it blank to use the ESPN name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {managers.isLoading && <p className="text-sm text-muted-foreground">Loading managers…</p>}
        {managers.data?.error && <p className="text-sm text-destructive">{managers.data.error}</p>}
        {managers.data?.managers.map((m) => {
          const value = drafts[m.key] ?? "";
          return (
            <div key={m.key} className="rounded-md border border-border bg-secondary/40 p-4">
              <p className="text-sm text-muted-foreground">
                Current: <span className="text-foreground">{m.name}</span> · {m.seasons.length} season{m.seasons.length === 1 ? "" : "s"}
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label={`Display name for ${m.name}`}
                  value={value}
                  placeholder={m.name}
                  onChange={(e) => setDrafts((d) => ({ ...d, [m.key]: e.target.value }))}
                />
                <Button type="button" onClick={() => handleSave(m.key, value)} disabled={savingKey === m.key}>
                  {savingKey === m.key ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ConnectPage() {
  const checkAdmin = useServerFn(getIsAdmin);
  const admin = useQuery({ queryKey: ["is-admin"], queryFn: () => checkAdmin({ data: undefined }) });

  if (admin.isLoading) {
    return <main className="field-grid min-h-screen bg-background" />;
  }
  if (!admin.data?.isAdmin) {
    return (
      <main className="field-grid flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-4xl text-foreground">Admins only</h1>
          <p className="mt-3 text-muted-foreground">This area is for the league admin.</p>
          <Button asChild className="mt-6">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
    );
  }
  return <AdminTools />;
}

function TeamNamesCard() {
  const fetchTeams = useServerFn(getLeagueTeams);
  const save = useServerFn(saveTeamName);
  const queryClient = useQueryClient();
  const teams = useQuery({ queryKey: ["league-teams"], queryFn: () => fetchTeams({ data: undefined }) });
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  async function handleSave(teamId: number, value: string) {
    if (!teams.data?.leagueId) return;
    setSavingId(teamId);
    try {
      const res = await save({ data: { leagueId: teams.data.leagueId, teamId, name: value } });
      if (!res.ok) toast.error(res.error ?? "Couldn't save.");
      else {
        toast.success(value.trim() ? "Team name saved." : "Reset to ESPN name.");
        await queryClient.invalidateQueries({ queryKey: ["league-teams"] });
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-2xl">Team names</CardTitle>
        <CardDescription>Set the name the site shows for each team. Leave it blank to use the ESPN name.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {teams.isLoading && <p className="text-sm text-muted-foreground">Loading teams from ESPN…</p>}
        {teams.data?.error && <p className="text-sm text-destructive">{teams.data.error}</p>}
        {teams.data?.teams.map((team) => {
          const value = drafts[team.id] ?? team.customName ?? "";
          return (
            <div key={team.id} className="rounded-md border border-border bg-secondary/40 p-4">
              <p className="text-sm text-muted-foreground">
                ESPN: <span className="text-foreground">{team.espnName}</span>
                {team.ownerName ? ` · ${team.ownerName}` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label={`Display name for ${team.espnName}`}
                  value={value}
                  placeholder={team.espnName}
                  onChange={(e) => setDrafts((d) => ({ ...d, [team.id]: e.target.value }))}
                />
                <Button type="button" onClick={() => handleSave(team.id, value)} disabled={savingId === team.id}>
                  {savingId === team.id ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
