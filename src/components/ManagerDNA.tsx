import { ArrowDownRight, ArrowUpRight, Dna, Star } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ManagerDNA as ManagerDNAData } from "@/lib/manager-dna";
import { Card, CardContent } from "@/components/ui/card";

const shortNames: Record<string, string> = {
  "Start/Sit IQ": "Start/Sit",
  "Waiver IQ": "Waivers",
  "Trade Instinct": "Trades",
  Aggression: "Aggro",
  Consistency: "Steady",
  Pettiness: "Rivalry",
  Volatility: "Volatile",
};

export function ManagerDNA({ dna }: { dna: ManagerDNAData }) {
  const chartData = dna.traits
    .filter((trait) => trait.score != null)
    .map((trait) => ({
      name: shortNames[trait.name] ?? trait.name,
      score: trait.score!,
    }));

  return (
    <section className="mb-10 rounded-lg border border-accent/50 bg-gradient-to-br from-accent/15 via-card to-card p-4 shadow-xl shadow-black/10 sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-primary">
            <Dna className="h-5 w-5" /> Manager DNA
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {dna.explanation}
          </p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-background/70 px-5 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="text-5xl font-black leading-none text-foreground">{dna.ovr}</span>
            <span className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground">
              /100
            </span>
            <span className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              OVR
            </span>
          </div>
          <p className="mt-2 text-sm font-bold uppercase tracking-wider text-accent-foreground">
            {dna.archetype}
          </p>
          {dna.ovrChange == null ? (
            <p className="mt-1 text-xs text-muted-foreground">Career movement unavailable</p>
          ) : dna.ovrChange > 0 ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <ArrowUpRight className="h-4 w-4" /> +{dna.ovrChange} vs prior seasons
            </p>
          ) : dna.ovrChange < 0 ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-300">
              <ArrowDownRight className="h-4 w-4" /> {dna.ovrChange} vs prior seasons
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No OVR change · prior seasons</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
        <Card className="border-border/70 bg-background/50">
          <CardContent className="p-3 sm:p-4">
            <h3 className="px-2 pt-1 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              DNA radar
            </h3>
            <div
              className="h-[300px] w-full"
              role="img"
              aria-label="Radar chart of the 13 Manager DNA traits"
            >
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData} outerRadius="70%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.22} />
                  <Tooltip
                    formatter={(value) => [`${value}/100`, "Score"]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-2xl text-foreground">13 traits</h3>
              <p className="text-xs text-muted-foreground">
                League-relative scores · higher means more of that trait
              </p>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {dna.sampleGames} games · {dna.sampleSeasons} seasons · {dna.snapshotWeeks} snapshot
              weeks
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {dna.traits.map((trait) => (
              <details
                key={trait.name}
                className="group rounded-md border border-border/70 bg-background/40 px-3 py-2.5"
              >
                <summary className="list-none cursor-pointer">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{trait.name}</span>
                    {trait.score == null ? (
                      <span className="text-xs font-bold text-muted-foreground">
                        Insufficient data
                      </span>
                    ) : (
                      <span className="text-sm font-black tabular-nums text-primary">
                        {trait.score}
                        <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                          /100
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    {trait.score != null && (
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-[width]"
                        style={{ width: `${trait.score}%` }}
                      />
                    )}
                  </div>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {trait.score == null
                      ? `${trait.sample} observations · insufficient evidence`
                      : trait.sample > 0
                        ? `${trait.sample} observations · details`
                        : "Limited data · details"}
                  </span>
                </summary>
                <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground">
                  {trait.basis}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
        OVR weights decision making 25%, roster management 20%, waiver IQ 15%, trade instinct 15%,
        clutch 10%, consistency 10%, and luck 5%. OVR is a weighted performance rating, not an
        average of the 13 traits. Ratings compare available team-season data; co-managers share team
        evidence. Snapshot-based traits use saved roster history only. Traits without sufficient
        evidence are marked “Insufficient data” and omitted from OVR weighting.
      </p>
    </section>
  );
}
