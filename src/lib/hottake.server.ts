// Generates a spicy weekly "hot take" from the week's data. Shared by the
// home page and the newsletter. The point is to be arguable — a take half
// the league wants to fight about in the group chat.

export interface HotTake {
  headline: string;
  body: string;
  managers: string;
  team: string;
}

interface ScoreRow { team: string; managers: string; pts: number; oppPts: number }
interface StandingRowIn { team: string; managers: string; w: number; l: number }
interface AllPlayRow { team: string; managers: string; w: number; l: number }

interface Candidate extends HotTake { spice: number }

export function makeHotTake(input: {
  scores: ScoreRow[];
  standings: StandingRowIn[];
  allPlay: AllPlayRow[];
}): HotTake | null {
  const { scores, standings, allPlay } = input;
  const played = scores.filter((x) => x.pts + x.oppPts > 0);
  if (!played.length) return null;

  const apOf = (managers: string) => allPlay.find((x) => x.managers === managers);
  const games = standings.reduce((n, s) => Math.max(n, s.w + s.l), 0);
  const cands: Candidate[] = [];

  const top = [...standings].sort((a, b) => b.w - a.w || a.l - b.l)[0];
  const bottom = [...standings].sort((a, b) => a.w - b.w || b.l - a.l)[0];
  const sortedAll = [...played].sort((a, b) => b.pts - a.pts);
  const best = sortedAll[0]!;
  const winners = played.filter((x) => x.pts > x.oppPts);
  const losers = played.filter((x) => x.pts < x.oppPts);

  // 1. Fraud watch: winning record, losing all-play record. Peak "actually
  //    they're not good" energy.
  if (top) {
    const ap = apOf(top.managers);
    if (ap && ap.w + ap.l >= 6 && ap.w / (ap.w + ap.l) < 0.45 && top.w > top.l) {
      cands.push({
        spice: 10,
        headline: `${top.team} is a FRAUD and the numbers prove it`,
        body: `${top.w}-${top.l} in the standings. ${ap.w}-${ap.l} if they played everyone every week. That's not a contender, that's a schedule merchant. Say it to ${top.managers}'s face.`,
        managers: top.managers, team: top.team,
      });
    }
  }

  // 2. Reverse fraud: bad record, winning all-play — "this team is actually
  //    good and everyone laughing at them is wrong."
  if (bottom) {
    const ap = apOf(bottom.managers);
    if (ap && ap.w > ap.l && bottom.w < bottom.l) {
      cands.push({
        spice: 9,
        headline: `${bottom.team} is secretly a playoff team`,
        body: `${bottom.w}-${bottom.l} on paper, ${ap.w}-${ap.l} against the whole league. Everyone's clowning ${bottom.managers} while the underlying numbers scream contender. You'll all see.`,
        managers: bottom.managers, team: bottom.team,
      });
    }
  }

  // 3. "Scoring a lot means nothing" — the league's top scorer this week
  //    isn't actually good if their season all-play is mid.
  {
    const ap = apOf(best.managers);
    const gamesPlayed = ap ? ap.w + ap.l : 0;
    if (ap && gamesPlayed >= 6 && ap.w / gamesPlayed < 0.5) {
      cands.push({
        spice: 8,
        headline: `${best.pts.toFixed(1)} points and it doesn't matter`,
        body: `${best.team} dropped the week's high score and I'm still not buying it. One loud week doesn't fix a ${ap.w}-${ap.l} all-play record. Prove it again next week, ${best.managers}.`,
        managers: best.managers, team: best.team,
      });
    }
  }

  // 4. "Luck merchants": the winner with the LOWEST score of all winners —
  //    they won with a score most of the league beat.
  {
    const ugly = [...winners].sort((a, b) => a.pts - b.pts)[0];
    if (ugly) {
      const wouldLoseTo = losers.filter((x) => x.pts > ugly.pts).length;
      if (wouldLoseTo >= 2) {
        cands.push({
          spice: 7,
          headline: `${ugly.team} had no business winning that game`,
          body: `${ugly.pts.toFixed(1)} points. ${wouldLoseTo} team${wouldLoseTo === 1 ? "" : "s"} that LOST this week outscored them. ${ugly.managers} didn't win a football game, they won a raffle.`,
          managers: ugly.managers, team: ugly.team,
        });
      }
    }
  }

  // 5. Cursed: top-3 score that still lost — "the league is rigged" take.
  const cursed = losers.sort((a, b) => b.pts - a.pts)[0];
  if (cursed && sortedAll.indexOf(cursed) <= 2) {
    cands.push({
      spice: 7,
      headline: `The league is rigged against ${cursed.team}`,
      body: `${cursed.pts.toFixed(1)} points — a top-3 score — and an L. At some point it's not bad luck, it's a conspiracy. Somebody check ${cursed.managers}'s opponent's lineup for witchcraft.`,
      managers: cursed.managers, team: cursed.team,
    });
  }

  // 6. "The best team isn't the first-place team" — highest all-play win %
  //    that isn't top of the standings.
  {
    const apBest = [...allPlay].filter((x) => x.w + x.l >= 6)
      .sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l))[0];
    if (apBest && top && apBest.managers !== top.managers) {
      cands.push({
        spice: 8,
        headline: `${apBest.team} is the best team in this league. Not ${top.team}.`,
        body: `Against everyone, every week, ${apBest.team} goes ${apBest.w}-${apBest.l} — the best mark in the league. The standings are lying to you. The real championship favorite is ${apBest.managers}.`,
        managers: apBest.managers, team: apBest.team,
      });
    }
  }

  // 7. Statement win → "dynasty loading" overreaction.
  const blow = winners.sort((a, b) => (b.pts - b.oppPts) - (a.pts - a.oppPts))[0];
  if (blow && blow.pts - blow.oppPts >= 40) {
    cands.push({
      spice: 6,
      headline: `Start engraving the trophy: ${blow.team} is inevitable`,
      body: `A ${(blow.pts - blow.oppPts).toFixed(1)}-point demolition. Yes, it's an overreaction to one week. No, I don't care. ${blow.managers} is winning this league and it's not close.`,
      managers: blow.managers, team: blow.team,
    });
  }

  // 8. Panic take: early season, a winless or one-win team — "blow it up."
  if (games >= 2 && games <= 6 && bottom && bottom.w <= 1) {
    cands.push({
      spice: 6,
      headline: `It's already over for ${bottom.team}. Blow it up.`,
      body: `${bottom.w}-${bottom.l} and sinking. The season isn't young anymore — it's slipping away. ${bottom.managers} needs a trade, a prayer, or both. Mostly both.`,
      managers: bottom.managers, team: bottom.team,
    });
  }

  // 9. Fallback: crown the week's top scorer, but make it a dare.
  if (!cands.length) {
    cands.push({
      spice: 5,
      headline: `${best.team} is the team to beat. Fight me.`,
      body: `${best.pts.toFixed(1)} points — the best in the league this week. Somebody in this league needs to step up and end this, because right now ${best.managers} is running the place.`,
      managers: best.managers, team: best.team,
    });
  }

  // Pick the spiciest eligible take.
  cands.sort((a, b) => b.spice - a.spice);
  const { spice: _s, ...take } = cands[0]!;
  return take;
}
