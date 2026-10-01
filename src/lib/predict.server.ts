// Server-only: pick'em style game predictions blending form, history and (lightly) projections.
import { matchWeeks, managerKey, teamManagers, type RawSeason } from "./league.server";

export type Prediction = { pick: "home" | "away"; confidence: number; reasons: string[]; upset: boolean };

const finished = (w?: string) => w === "HOME" || w === "AWAY" || w === "TIE";

/** Predict a game in season `s`, week `week`, using only results before that week. */
export function predictGame(seasons: RawSeason[], s: RawSeason, homeId: number, awayId: number, week: number, homeProj?: number | null, awayProj?: number | null): Prediction {
  const teams = s.teams ?? [];
  const nameOf = (id: number) => { const t = teams.find((x) => x.id === id); return t ? teamManagers(s, t).join(" & ") || `Team ${id}` : `Team ${id}`; };
  const hName = nameOf(homeId), aName = nameOf(awayId);

  // Season-to-date scores per team.
  const pts = new Map<number, number[]>();
  const wins = new Map<number, number>();
  for (const m of s.schedule ?? []) {
    if (!finished(m.winner) || (m.matchupPeriodId ?? 0) >= week) continue;
    for (const wk of matchWeeks(m)) {
      if (m.home?.teamId != null) pts.set(m.home.teamId, [...(pts.get(m.home.teamId) ?? []), wk.homePts]);
      if (m.away?.teamId != null) pts.set(m.away.teamId, [...(pts.get(m.away.teamId) ?? []), wk.awayPts]);
    }
    const w = m.winner === "HOME" ? m.home?.teamId : m.winner === "AWAY" ? m.away?.teamId : undefined;
    if (w != null) wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const hp = pts.get(homeId) ?? [], ap = pts.get(awayId) ?? [];
  const hAvg = avg(hp), aAvg = avg(ap);
  const hRecent = avg(hp.slice(-3)), aRecent = avg(ap.slice(-3));
  const hWin = hp.length ? (wins.get(homeId) ?? 0) / hp.length : 0.5;
  const aWin = ap.length ? (wins.get(awayId) ?? 0) / ap.length : 0.5;
  const sd = (a: number[], m: number) => (a.length > 1 ? Math.sqrt(avg(a.map((x) => (x - m) ** 2))) : 0);
  const hSd = sd(hp, hAvg), aSd = sd(ap, aAvg);

  // All-time head-to-head by manager across every season.
  const hk = hName.split(" & ").map(managerKey), ak = aName.split(" & ").map(managerKey);
  let hh = 0, ah = 0;
  for (const ss of seasons) {
    const tm = new Map((ss.teams ?? []).map((t) => [t.id, teamManagers(ss, t).map(managerKey)]));
    for (const m of ss.schedule ?? []) {
      if (!finished(m.winner) || m.winner === "TIE") continue;
      if (ss.seasonId === s.seasonId && (m.matchupPeriodId ?? 0) >= week) continue;
      const x = tm.get(m.home?.teamId) ?? [], y = tm.get(m.away?.teamId) ?? [];
      const xh = x.some((k) => hk.includes(k)), ya = y.some((k) => ak.includes(k));
      const xa = x.some((k) => ak.includes(k)), yh = y.some((k) => hk.includes(k));
      if (xh && ya) m.winner === "HOME" ? hh++ : ah++;
      else if (xa && yh) m.winner === "AWAY" ? hh++ : ah++;
    }
  }

  const hasProj = homeProj != null && awayProj != null && homeProj + awayProj > 0;
  // Each factor is capped so no single one dominates, and the total is scaled so
  // confidence spreads across the 51–92 range instead of pinning at the cap.
  const cap = (x: number, m: number) => Math.max(-m, Math.min(m, x));
  const f = {
    avg: cap(((hAvg - aAvg) / 30) * 0.7, 0.45),
    recent: cap(((hRecent - aRecent) / 30) * 0.55, 0.35),
    proj: hasProj ? cap(((homeProj! - awayProj!) / 30) * 0.4, 0.3) : 0,
    h2h: hh + ah >= 2 ? ((hh - ah) / (hh + ah)) * 0.3 : 0,
    rec: cap((hWin - aWin) * 0.4, 0.25),
  };
  const z = f.avg + f.recent + f.proj + f.h2h + f.rec;
  const prob = 1 / (1 + Math.exp(-z));
  const pick: "home" | "away" = z >= 0 ? "home" : "away";
  const confidence = Math.round(Math.min(92, Math.max(51, (pick === "home" ? prob : 1 - prob) * 100)));
  const sign = pick === "home" ? 1 : -1;
  const W = pick === "home" ? hName : aName, Lo = pick === "home" ? aName : hName;
  const wAvg = pick === "home" ? hAvg : aAvg, lAvg = pick === "home" ? aAvg : hAvg;
  const wRec = pick === "home" ? hRecent : aRecent, lRec = pick === "home" ? aRecent : hRecent;
  const wH = pick === "home" ? hh : ah, lH = pick === "home" ? ah : hh;
  const wP = pick === "home" ? homeProj : awayProj, lP = pick === "home" ? awayProj : homeProj;
  const lSd = pick === "home" ? aSd : hSd;

  const reasons: { w: number; t: string }[] = [];
  if (f.avg * sign > 0.05) reasons.push({ w: f.avg * sign, t: `${W} is averaging ${wAvg.toFixed(1)} a week to ${Lo}'s ${lAvg.toFixed(1)}.` });
  if (f.recent * sign > 0.05) reasons.push({ w: f.recent * sign, t: `Hotter lately: ${wRec.toFixed(1)} per game over the last three weeks vs ${lRec.toFixed(1)}.` });
  if (f.h2h * sign > 0) reasons.push({ w: f.h2h * sign, t: `Owns the series ${wH}–${lH} all-time.` });
  if (f.proj * sign > 0.05) reasons.push({ w: f.proj * sign, t: `The roster projects ${(wP ?? 0).toFixed(1)} to ${(lP ?? 0).toFixed(1)} on paper.` });
  if (f.rec * sign > 0.1) reasons.push({ w: f.rec * sign, t: `Simply winning more games this year.` });
  reasons.sort((a, b) => b.w - a.w);
  const out = reasons.slice(0, 3).map((r) => r.t);
  // Counterpoints keep it honest.
  const upset = hasProj && ((pick === "home" && homeProj! < awayProj!) || (pick === "away" && awayProj! < homeProj!));
  if (upset) out.push(`Going against the projections here: ESPN has ${Lo} ahead by ${Math.abs((wP ?? 0) - (lP ?? 0)).toFixed(1)}. We're trusting the track record.`);
  else if (f.h2h * sign < 0) out.push(`Watch out: ${Lo} leads the all-time series ${lH}–${wH}.`);
  else if (lSd > 25) out.push(`${Lo} is boom-or-bust (swings of ±${lSd.toFixed(0)} pts), so this could flip.`);
  if (!out.length) out.push(hp.length ? "Coin-flip territory. Going with the slightly better roster." : "No games played yet. Going with history and the roster.");
  return { pick, confidence, reasons: out, upset };
}
