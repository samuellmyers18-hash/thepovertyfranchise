import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getPlayerRankings } from "@/lib/league.functions";
import { ManagerNames } from "@/components/LeagueHome";

const DESC = "Player rankings blending ESPN projections, season scoring, expert ranks and ownership trends.";
export const Route = createFileRoute("/_authenticated/players")({
  head: () => ({
    meta: [
      { title: "Player Rankings — The Poverty Franchise" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Player Rankings — The Poverty Franchise" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayersPage,
});

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "D/ST", "K"];

function PlayersPage() {
  const fetchRanks = useServerFn(getPlayerRankings);
  const { data, isLoading } = useQuery({ queryKey: ["player-rankings"], queryFn: () => fetchRanks() });
  const [pos, setPos] = useState("ALL");
  const [avail, setAvail] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(
    () => (data?.players ?? [])
      .filter((p) => pos === "ALL" || p.pos === pos)
      .filter((p) => !avail || !p.team)
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 150),
    [data, pos, avail, q],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">The Poverty Franchise</p>
      <h1 className="mb-2 text-6xl text-foreground">Player rankings</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Our model blends rest-of-season projections (30%), season scoring average (25%), this week's projection (20%),
        ESPN expert rank (10%), league-wide ownership (10%) and add/drop trend (5%), with a penalty for injuries.
        {data?.season ? ` ${data.season}, week ${data.week}.` : ""}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {POSITIONS.map((p) => (
          <button key={p} onClick={() => setPos(p)}
            className={`rounded-md border px-3 py-1.5 text-sm ${pos === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
            {p}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /> Free agents only
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player"
          className="ml-auto rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground" />
      </div>

      {isLoading && <p className="text-muted-foreground">Crunching the numbers…</p>}
      {data?.error && <p className="text-destructive">{data.error}</p>}

      {list.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">#</th><th className="p-3">Player</th><th className="p-3">Pos</th><th className="p-3">Score</th>
                <th className="p-3">Tier</th><th className="p-3">Avg</th><th className="p-3">Wk proj</th><th className="p-3">ROS proj</th>
                <th className="p-3">Owned</th><th className="p-3">Trend</th><th className="p-3">League team</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-border/50 text-foreground">
                  <td className="p-3 text-muted-foreground">{p.rank}</td>
                  <td className="p-3 font-medium">
                    {p.name}
                    {p.injury && <span className="ml-2 rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">{p.injury.replace("_", " ")}</span>}
                  </td>
                  <td className="p-3">{p.pos}{p.posRank}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.max(0, Math.min(100, p.score))}%` }} /></div>
                      {p.score.toFixed(1)}
                    </div>
                  </td>
                  <td className="p-3 text-primary">{p.tier}</td>
                  <td className="p-3">{p.seasonAvg.toFixed(1)}</td>
                  <td className="p-3">{p.weekProj.toFixed(1)}</td>
                  <td className="p-3">{p.rosProj.toFixed(0)}</td>
                  <td className="p-3">{p.owned.toFixed(0)}%</td>
                  <td className={`p-3 ${p.trend > 0 ? "text-primary" : p.trend < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {p.trend > 0 ? "▲" : p.trend < 0 ? "▼" : ""}{Math.abs(p.trend).toFixed(1)}
                  </td>
                  <td className="p-3">{p.team ? <ManagerNames names={p.managers} /> : <span className="text-muted-foreground">Free agent</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
