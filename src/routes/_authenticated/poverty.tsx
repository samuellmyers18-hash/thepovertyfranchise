import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Coins, TrendingDown } from "lucide-react";
import { getPovertyRankings } from "@/lib/poverty.functions";
import { ManagerNames } from "@/components/LeagueHome";

export const Route = createFileRoute("/_authenticated/poverty")({
  head: () => ({
    meta: [
      { title: "Poverty Meter — The Poverty Franchise" },
      {
        name: "description",
        content:
          "A weekly audit of fantasy football misfortune, bad beats and points abandoned on the bench.",
      },
      { property: "og:title", content: "Poverty Meter — The Poverty Franchise" },
      { property: "og:description", content: "Who is living through the roughest fantasy season?" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PovertyPage,
});

function levelStyle(level: string) {
  if (level === "Generational Poverty") return "border-red-500/40 bg-red-500/15 text-red-300";
  if (level === "Very Poor") return "border-orange-500/40 bg-orange-500/15 text-orange-300";
  if (level === "Poor") return "border-amber-400/40 bg-amber-400/15 text-amber-200";
  if (level === "Struggling") return "border-sky-400/40 bg-sky-400/10 text-sky-200";
  return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
}

function PovertyPage() {
  const fetchRankings = useServerFn(getPovertyRankings);
  const { data, isLoading } = useQuery({
    queryKey: ["poverty-rankings"],
    queryFn: () => fetchRankings(),
  });
  const worst = data?.teams[0];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-primary">
        <Coins className="h-4 w-4" /> The Poverty Franchise
      </p>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-6xl text-foreground">Poverty Meter</h1>
          <p className="mt-1 text-muted-foreground">
            A forensic audit of bad beats, empty benches and financial hardship.
          </p>
        </div>
        {data?.season && (
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
            {data.season} · through week {data.week}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Counting the empty wallets…</p>
      ) : data?.error ? (
        <p className="text-destructive">{data.error}</p>
      ) : !worst ? (
        <p className="text-muted-foreground">No completed matchups to measure yet.</p>
      ) : (
        <>
          <section className="field-grid relative mb-8 overflow-hidden rounded-lg border border-accent/50 bg-gradient-to-br from-accent/20 via-card to-card p-5 sm:p-8">
            <Coins className="absolute -right-3 -top-4 h-24 w-24 rotate-12 text-primary/10 sm:h-36 sm:w-36" />
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.28em] text-accent">
              <TrendingDown className="h-4 w-4" /> The league basement · week {data.week}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
              <div>
                <h2 className="text-4xl leading-none text-foreground sm:text-6xl">{worst.team}</h2>
                {worst.managers && (
                  <ManagerNames
                    names={worst.managers}
                    className="mt-2 block text-sm text-muted-foreground"
                  />
                )}
              </div>
              <div className="flex items-end gap-3">
                <span className="gold-text text-7xl font-black leading-none sm:text-9xl">
                  {worst.score}
                </span>
                <span className="mb-1 text-sm uppercase tracking-widest text-muted-foreground">
                  / 100
                </span>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-background/80">
              <div
                className="bar-animated h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500"
                style={{ width: `${worst.score}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-sm font-bold ${levelStyle(worst.level)}`}
              >
                {worst.level}
              </span>
              <p className="text-xs text-muted-foreground">
                A rising score means the season is getting rougher.
              </p>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-3xl text-foreground sm:text-4xl">Poverty Rankings</h2>
                <p className="text-sm text-muted-foreground">
                  The league's hardest luck, ranked from most to least.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Week {data.week} · {data.teams.length} teams
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Team</th>
                    <th className="px-3 py-3">Poverty score</th>
                    <th className="px-3 py-3">Level</th>
                    <th className="px-3 py-3">Week change</th>
                    <th className="px-3 py-3">Case file</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teams.map((team) => (
                    <tr key={team.teamId} className="row-hover border-t border-border align-top">
                      <td className="px-3 py-4 text-xl font-black text-primary">{team.rank}</td>
                      <td className="px-3 py-4">
                        <span className="font-semibold text-foreground">{team.team}</span>
                        {team.managers && (
                          <ManagerNames
                            names={team.managers}
                            className="block text-xs text-muted-foreground"
                          />
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-lg font-black text-foreground">
                            {team.score}
                          </span>
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500"
                              style={{ width: `${team.score}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${levelStyle(team.level)}`}
                        >
                          {team.level}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        {team.change == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : team.change > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-300">
                            <ArrowUpRight className="h-4 w-4" />+{team.change}
                          </span>
                        ) : team.change < 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                            <ArrowDownRight className="h-4 w-4" />
                            {team.change}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">— 0</span>
                        )}
                      </td>
                      <td className="max-w-sm px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                        {team.explanation.map((reason, index) => (
                          <span
                            key={index}
                            className="mr-1.5 mb-1 inline-block rounded bg-secondary px-2 py-1"
                          >
                            {reason}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 rounded-lg border border-border bg-card p-5">
            <h2 className="text-2xl text-foreground">How the meter works</h2>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Scores compare each team with the rest of this league across points per game, record,
              low-scoring weeks, losing streaks, loss margins, expected record, lucky wins and
              unlucky losses, bench points, and recent scoring decline. The 0–100 score is a
              weighted league ranking; higher means rougher luck. Week change compares this score
              with the previous completed week.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Bench points are included when an existing weekly roster and player-pool snapshot is
              available ({data.benchWeeksAvailable} week{data.benchWeeksAvailable === 1 ? "" : "s"}{" "}
              on file). Scores are calculated live and are not written to weekly records or
              snapshots.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
