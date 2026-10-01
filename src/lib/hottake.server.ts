// Generates a spicy weekly "hot take" from the week's data. Shared by the
// home page and the newsletter.

export interface HotTake {
  headline: string;
  body: string;
  managers: string;
  team: string;
}

interface ScoreRow { team: string; managers: string; pts: number; oppPts: number }
interface StandingRowIn { team: string; managers: string; w: number; l: number }
interface AllPlayRow { team: string; managers: string; w: number; l: number }

export function makeHotTake(input: {
  scores: ScoreRow[];
  standings: StandingRowIn[];
  allPlay: AllPlayRow[];
}): HotTake | null {
  const { scores, standings, allPlay } = input;
  const played = scores.filter((x) => x.pts + x.oppPts > 0);
  if (!played.length) return null;

  const apOf = (managers: string) => allPlay.find((x) => x.managers === managers);

  // 1. Fraud watch: best record but a losing all-play record.
  const top = [...standings].sort((a, b) => b.w - a.w || a.l - b.l)[0];
  if (top) {
    const ap = apOf(top.managers);
    if (ap && ap.w + ap.l >= 6 && ap.w / (ap.w + ap.l) < 0.45 && top.w > top.l) {
      return {
        headline: `FRAUD WATCH: ${top.team} is living a lie`,
        body: `${top.w}-${top.l} looks pretty in the standings, but against the whole league every week they'd be ${ap.w}-${ap.l}. The schedule has been a gift. Enjoy it while it lasts.`,
        managers: top.managers, team: top.team,
      };
    }
  }

  // 2. Cursed: a top-3 score this week that still lost.
  const sortedAll = [...played].sort((a, b) => b.pts - a.pts);
  const cursed = played.filter((x) => x.pts < x.oppPts).sort((a, b) => b.pts - a.pts)[0];
  if (cursed && sortedAll.indexOf(cursed) <= 2) {
    return {
      headline: `${cursed.team} scored ${cursed.pts.toFixed(1)} and LOST`,
      body: `A top-3 score this week and an L to show for it. The football gods have personally targeted ${cursed.managers}. There is no other explanation.`,
      managers: cursed.managers, team: cursed.team,
    };
  }

  // 3. Sleeping giant: bad record, winning all-play record.
  const bottom = [...standings].sort((a, b) => a.w - b.w || b.l - a.l)[0];
  if (bottom) {
    const ap = apOf(bottom.managers);
    if (ap && ap.w > ap.l && bottom.w < bottom.l) {
      return {
        headline: `${bottom.team} is better than the record says`,
        body: `${bottom.w}-${bottom.l} in the standings, but ${ap.w}-${ap.l} against everyone. The wins are coming. Be afraid.`,
        managers: bottom.managers, team: bottom.team,
      };
    }
  }

  // 4. Statement win: a 40+ point demolition.
  const blow = played.filter((x) => x.pts > x.oppPts).sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0];
  if (blow && blow.pts - blow.oppPts >= 40) {
    return {
      headline: `${blow.team} didn't win — they made a statement`,
      body: `A ${(blow.pts - blow.oppPts).toFixed(1)}-point demolition. ${blow.managers} sent a message to the whole league this week.`,
      managers: blow.managers, team: blow.team,
    };
  }

  // 5. Fallback: crown the week's top scorer.
  const best = sortedAll[0]!;
  return {
    headline: `${best.team} is the team to beat`,
    body: `${best.pts.toFixed(1)} points this week — the best in the league. Until somebody knocks ${best.managers} off, the crown stays.`,
    managers: best.managers, team: best.team,
  };
}
