import type { ManagerSummary } from "@/lib/league.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";

const mKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

export function ManagerStats({ m }: { m: ManagerSummary }) {
  const games = m.wins + m.losses + m.ties;
  const pct = games ? ((m.wins + m.ties / 2) / games).toFixed(3).replace(/^0/, "") : "—";
  const stats: [string, string | number][] = [
    ["Record", `${m.wins}-${m.losses}${m.ties ? `-${m.ties}` : ""}`],
    ["Win %", pct],
    ["Seasons", m.seasons.length],
    ["Titles", m.championships],
    ["Best finish", m.bestFinish ?? "—"],
    ["Points for", m.pointsFor.toFixed(1)],
    ["Points against", m.pointsAgainst.toFixed(1)],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <Card key={k}><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="text-3xl text-foreground">{v}</p>
          </CardContent></Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>{["Season", "Team", "Record", "PF", "PA", "Finish"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {m.seasons.map((s) => (
              <tr key={`${s.season}-${s.teamId}`} className="border-t border-border">
                <td className="px-3 py-2">{s.season}</td>
                <td className="px-3 py-2">
                  {s.teamName}
                  {s.coManagers.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      with {s.coManagers.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          <Link to="/managers/$key" params={{ key: mKey(n) }} className="hover:text-primary hover:underline">{n}</Link>
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ""}</td>
                <td className="px-3 py-2">{s.pointsFor.toFixed(1)}</td>
                <td className="px-3 py-2">{s.pointsAgainst.toFixed(1)}</td>
                <td className="px-3 py-2">{s.finalRank === 1 ? "🏆 1st" : s.finalRank ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
