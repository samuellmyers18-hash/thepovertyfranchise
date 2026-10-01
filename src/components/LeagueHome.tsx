import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLeagueHome } from "@/lib/league.functions";
import { Card, CardContent } from "@/components/ui/card";

export function LeagueHome() {
  const fetchHome = useServerFn(getLeagueHome);
  const { data, isLoading } = useQuery({ queryKey: ["league-home"], queryFn: () => fetchHome(), staleTime: 5 * 60_000 });

  if (isLoading) return <p className="mt-12 text-muted-foreground">Pulling the latest from ESPN…</p>;
  if (!data || data.error && !data.standings.length) return <p className="mt-12 text-destructive">{data?.error}</p>;

  const th = "px-3 py-2 text-left";
  return (
    <div className="mt-12 space-y-12">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">
        {data.season} season · through week {data.week}
      </p>

      <section>
        <h2 className="text-4xl text-foreground">Power rankings</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          40% all-play record (how you'd do vs. everyone each week), 30% actual record, 30% scoring over the last 3 weeks.
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground"><tr>{["#", "Team", "Score", "Record", "All-play", "Last 3 avg", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.power.map((p) => (
                <tr key={p.teamId} className="border-t border-border">
                  <td className="px-3 py-2 text-2xl text-primary">{p.rank}</td>
                  <td className="px-3 py-2"><span className="font-semibold text-foreground">{p.team}</span><span className="block text-xs text-muted-foreground">{p.managers}</span></td>
                  <td className="px-3 py-2">{p.score}</td>
                  <td className="px-3 py-2">{p.wins}-{p.losses}{p.ties ? `-${p.ties}` : ""}</td>
                  <td className="px-3 py-2">{p.allPlay}</td>
                  <td className="px-3 py-2">{p.recentAvg.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs text-primary">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-4xl text-foreground">Standings</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground"><tr>{["", "Team", "W-L", "PF", "PA", "Streak"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.standings.map((s, i) => (
                <tr key={s.teamId} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2"><span className="font-semibold text-foreground">{s.team}</span><span className="block text-xs text-muted-foreground">{s.managers}</span></td>
                  <td className="px-3 py-2">{s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ""}</td>
                  <td className="px-3 py-2">{s.pf.toFixed(1)}</td>
                  <td className="px-3 py-2">{s.pa.toFixed(1)}</td>
                  <td className="px-3 py-2">{s.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-4xl text-foreground">Fun facts</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.facts.map((f) => (
            <Card key={f.title}><CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{f.title}</p>
              <p className="text-3xl text-primary">{f.value}</p>
              <p className="text-sm text-foreground">{f.detail}</p>
            </CardContent></Card>
          ))}
        </div>
      </section>
    </div>
  );
}
