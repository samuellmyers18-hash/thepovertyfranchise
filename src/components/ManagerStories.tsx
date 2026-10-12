import { BookOpen, Clapperboard, Swords } from "lucide-react";
import type { ManagerStory, ManagerStoryEntry } from "@/lib/manager-stories";
import { Card, CardContent } from "@/components/ui/card";

function ChapterCard({ entry }: { entry: ManagerStoryEntry }) {
  return (
    <Card className="border-border/70 bg-background/50">
      <CardContent className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          {entry.season}
          {entry.week > 0 ? " · Week " + entry.week : ""}
        </p>
        <h4 className="mt-1 text-xl text-foreground">{entry.title}</h4>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.content}</p>
      </CardContent>
    </Card>
  );
}

export function ManagerStories({ story }: { story: ManagerStory }) {
  return (
    <section className="mb-10 rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-xl shadow-black/10 sm:p-7">
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-3xl text-foreground">Manager Stories</h2>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            A living archive of verified league history
          </p>
        </div>
      </div>

      {!story.available ? (
        <p className="rounded-md border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
          The story archive is not available yet. Its storage migration must be approved and applied
          before chapters can be saved.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/70 bg-background/50">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Career Summary
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {story.careerSummary?.content ??
                    "The archive is waiting for its first completed matchup."}
                </p>
                {story.careerSummary && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Version recorded after {story.careerSummary.season} · Week{" "}
                    {story.careerSummary.week}
                  </p>
                )}
                {story.careerSummaryHistory.length > 0 && (
                  <details className="mt-3 border-t border-border/60 pt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">
                      Previous career summaries ({story.careerSummaryHistory.length})
                    </summary>
                    <div className="mt-3 grid gap-3">
                      {story.careerSummaryHistory.map((version) => (
                        <div key={version.event_key} className="border-l-2 border-primary/40 pl-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {version.season} · Week {version.week}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {version.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-background/50">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Current Season
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {story.currentSeasonSummary?.content ??
                    "No completed matchup has been recorded this season."}
                </p>
                {story.currentSeasonSummary && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Version recorded after {story.currentSeasonSummary.season} · Week{" "}
                    {story.currentSeasonSummary.week}
                  </p>
                )}
                {story.currentSeasonHistory.length > 0 && (
                  <details className="mt-3 border-t border-border/60 pt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">
                      Previous current-season versions ({story.currentSeasonHistory.length})
                    </summary>
                    <div className="mt-3 grid gap-3">
                      {story.currentSeasonHistory.map((version) => (
                        <div key={version.event_key} className="border-l-2 border-primary/40 pl-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {version.season} · Week {version.week}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {version.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          </div>

          {story.latestChapter && (
            <div className="mt-6">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                <Clapperboard className="h-4 w-4" /> Latest Chapter
              </p>
              <ChapterCard entry={story.latestChapter} />
            </div>
          )}

          <div className="mt-7 grid gap-7 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xl text-foreground">Career Foundation</h3>
              {story.careerFoundation ? (
                <ChapterCard entry={story.careerFoundation} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The foundation will be recorded when completed results are available.
                </p>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-xl text-foreground">Defining Moments</h3>
              <div className="grid gap-3">
                {story.definingMoments.length ? (
                  story.definingMoments.map((entry) => (
                    <ChapterCard key={entry.event_key} entry={entry} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No significant verified turning point has been added yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-7">
            <h3 className="mb-3 flex items-center gap-2 text-xl text-foreground">
              <Swords className="h-5 w-5 text-primary" /> Rivalries
            </h3>
            {story.rivalries.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {story.rivalries.map((rival) => (
                  <Card key={rival.opponent} className="border-border/70 bg-background/50">
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="font-semibold text-foreground">{rival.opponent}</p>
                        <p className="text-xs text-muted-foreground">
                          {rival.games} finalized meetings · latest {rival.latest}
                        </p>
                      </div>
                      <p className="text-lg font-black tabular-nums text-primary">
                        {rival.wins}-{rival.losses}
                        {rival.ties ? "-" + rival.ties : ""}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Verified rivalry records appear after at least two completed meetings.
              </p>
            )}
            {story.rivalryChapters.length > 0 && (
              <div className="mt-4 grid gap-3">
                {story.rivalryChapters.map((entry) => (
                  <ChapterCard key={entry.event_key} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
