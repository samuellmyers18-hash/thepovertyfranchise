import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RawMatch, RawSeason, RawTeam } from "./league.server";

const r2 = (n: number) => Math.round(n * 100) / 100;
const lib = () => import("./league.server");
type L = Awaited<ReturnType<typeof lib>>;

export type Side = { teamId: number; team: string; managers: string; pts: number };
export type Game = { season: number; week: number; playoff: boolean; home: Side; away: Side };
export type RecordEntry = { value: string; who: string; detail: string; season: number };
export type RecordCat = { title: string; blurb: string; entries: RecordEntry[] };

const done = (m: RawMatch) => m.winner === "HOME" || m.winner === "AWAY" || m.winner === "TIE";

function games(L: L, s: RawSeason): Game[] {
  const byId = new Map((s.teams ?? []).map((t) => [t.id, t]));
  const side = (id: number | undefined, pts: number): Side | null => {
    const t = id != null ? byId.get(id) : undefined;
    if (!t) return null;
    return { teamId: t.id ?? 0, team: L.teamName(t), managers: L.teamManagers(s, t).join(" & "), pts: r2(pts) };
  };
  const out: Game[] = [];
  for (const m of s.schedule ?? []) {
    if (!done(m)) continue;
    const playoff = !!m.playoffTierType && m.playoffTierType !== "NONE";
    if (m.playoffTierType && m.playoffTierType !== "NONE" && m.playoffTierType !== "WINNERS_BRACKET") continue;
    for (const w of L.matchWeeks(m)) {
      const h = side(m.home?.teamId, w.homePts);
      const a = side(m.away?.teamId, w.awayPts);
      if (!h || !a || h.pts + a.pts === 0) continue;
      out.push({ season: s.seasonId ?? 0, week: w.period, playoff, home: h, away: a });
    }
  }
  return out;
}
const winLose = (g: Game) => (g.home.pts >= g.away.pts ? [g.home, g.away] : [g.away, g.home]) as [Side, Side];
const top = <T,>(arr: T[], f: (x: T) => number, n = 5) => [...arr].sort((a, b) => f(b) - f(a)).slice(0, n);
const label = (g: Game) => `${g.season} · Week ${g.week}${g.playoff ? " (playoffs)" : ""}`;

/* ---------------- Records ---------------- */
export const getRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    if (!seasons.length) return { error: error ?? "No data yet.", cats: [] as RecordCat[] };
    const all = seasons.flatMap((s) => games(L, s));
    const scores = all.flatMap((g) => [
      { s: g.home, opp: g.away, g },
      { s: g.away, opp: g.home, g },
    ]);
    const teamSeasons = seasons.flatMap((s) =>
      (s.teams ?? []).map((t: RawTeam) => {
        const o = t.record?.overall ?? {};
        const gp = (o.wins ?? 0) + (o.losses ?? 0) + (o.ties ?? 0);
        return { season: s.seasonId ?? 0, team: L.teamName(t), managers: L.teamManagers(s, t).join(" & "), w: o.wins ?? 0, l: o.losses ?? 0, pf: o.pointsFor ?? 0, pa: o.pointsAgainst ?? 0, gp, rank: t.rankCalculatedFinal ?? 0 };
      }),
    ).filter((t) => t.gp > 0);

    // Win streaks per manager across all regular+playoff games, chronological
    const streaks: RecordEntry[] = [];
    const byMgr = new Map<string, { win: boolean; g: Game }[]>();
    for (const g of [...all].sort((a, b) => a.season - b.season || a.week - b.week)) {
      const [w, l] = winLose(g);
      for (const n of w.managers.split(" & ")) byMgr.set(n, [...(byMgr.get(n) ?? []), { win: true, g }]);
      for (const n of l.managers.split(" & ")) byMgr.set(n, [...(byMgr.get(n) ?? []), { win: false, g }]);
    }
    const lossStreaks: RecordEntry[] = [];
    for (const [n, list] of byMgr) {
      let best = 0, cur = 0, end: Game | null = null, worst = 0, lc = 0, lend: Game | null = null;
      for (const x of list) {
        if (x.win) { cur++; lc = 0; if (cur > best) { best = cur; end = x.g; } }
        else { lc++; cur = 0; if (lc > worst) { worst = lc; lend = x.g; } }
      }
      if (end) streaks.push({ value: `${best} W`, who: n, detail: `ended ${label(end)}`, season: end.season });
      if (lend) lossStreaks.push({ value: `${worst} L`, who: n, detail: `ended ${label(lend)}`, season: lend.season });
    }
    const titles = new Map<string, number[]>();
    teamSeasons.filter((t) => t.rank === 1).forEach((t) => t.managers.split(" & ").forEach((n) => titles.set(n, [...(titles.get(n) ?? []), t.season])));

    const sc = (x: (typeof scores)[number]): RecordEntry => ({ value: x.s.pts.toFixed(2), who: x.s.managers, detail: `${label(x.g)} vs ${x.opp.managers} (${x.opp.pts.toFixed(2)})`, season: x.g.season });
    const gm = (g: Game, v: string): RecordEntry => { const [w, l] = winLose(g); return { value: v, who: w.managers, detail: `${w.pts.toFixed(2)}–${l.pts.toFixed(2)} over ${l.managers} · ${label(g)}`, season: g.season }; };
    const ts = (t: (typeof teamSeasons)[number], v: string): RecordEntry => ({ value: v, who: t.managers, detail: `${t.team} · ${t.season} (${t.w}-${t.l})`, season: t.season });

    const cats: RecordCat[] = [
      { title: "Highest single week", blurb: "The biggest one-week explosions ever.", entries: top(scores, (x) => x.s.pts).map(sc) },
      { title: "Lowest single week", blurb: "Weeks best forgotten.", entries: top(scores, (x) => -x.s.pts).map(sc) },
      { title: "Biggest blowouts", blurb: "Largest margins of victory.", entries: top(all, (g) => Math.abs(g.home.pts - g.away.pts)).map((g) => gm(g, `+${Math.abs(g.home.pts - g.away.pts).toFixed(2)}`)) },
      { title: "Closest games", blurb: "Decided by a hair.", entries: top(all.filter((g) => g.home.pts !== g.away.pts), (g) => -Math.abs(g.home.pts - g.away.pts)).map((g) => gm(g, `+${Math.abs(g.home.pts - g.away.pts).toFixed(2)}`)) },
      { title: "Highest-scoring games", blurb: "Combined points, both teams.", entries: top(all, (g) => g.home.pts + g.away.pts).map((g) => gm(g, (g.home.pts + g.away.pts).toFixed(2))) },
      { title: "Highest score in a loss", blurb: "Did everything right and still lost.", entries: top(all, (g) => winLose(g)[1].pts).map((g) => { const [w, l] = winLose(g); return { value: l.pts.toFixed(2), who: l.managers, detail: `lost to ${w.managers} (${w.pts.toFixed(2)}) · ${label(g)}`, season: g.season }; }) },
      { title: "Lowest score in a win", blurb: "Ugly wins still count.", entries: top(all, (g) => -winLose(g)[0].pts).map((g) => { const [w, l] = winLose(g); return { value: w.pts.toFixed(2), who: w.managers, detail: `beat ${l.managers} (${l.pts.toFixed(2)}) · ${label(g)}`, season: g.season }; }) },
      { title: "Most points in a season", blurb: "Total points for.", entries: top(teamSeasons, (t) => t.pf).map((t) => ts(t, t.pf.toFixed(1))) },
      { title: "Fewest points in a season", blurb: "Offensively challenged.", entries: top(teamSeasons, (t) => -t.pf / t.gp).map((t) => ts(t, `${(t.pf / t.gp).toFixed(1)}/wk`)) },
      { title: "Most points against", blurb: "Everyone saved their best for them.", entries: top(teamSeasons, (t) => t.pa).map((t) => ts(t, t.pa.toFixed(1))) },
      { title: "Best regular-season record", blurb: "Win percentage.", entries: top(teamSeasons, (t) => t.w / t.gp + t.pf / 1e6).map((t) => ts(t, `${t.w}-${t.l}`)) },
      { title: "Worst regular-season record", blurb: "Rock bottom.", entries: top(teamSeasons, (t) => -t.w / t.gp - t.pf / 1e6).map((t) => ts(t, `${t.w}-${t.l}`)) },
      { title: "Longest win streaks", blurb: "Consecutive wins, across seasons.", entries: top(streaks, (x) => parseInt(x.value)) },
      { title: "Longest losing streaks", blurb: "Consecutive losses, across seasons.", entries: top(lossStreaks, (x) => parseInt(x.value)) },
      { title: "Most championships", blurb: "Hardware.", entries: top([...titles], ([, y]) => y.length).map(([n, y]) => ({ value: `${y.length}×`, who: n, detail: y.sort().join(", "), season: y[0] ?? 0 })) },
    ];
    return { error: null as string | null, cats };
  });

/* ---------------- Awards ---------------- */
export type Award = { title: string; emoji: string; who: string; detail: string };

export const getAwards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { season?: number | undefined }) => ({ season: Number.isInteger(i?.season) ? i.season : undefined }))
  .handler(async ({ data }) => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    const years = seasons.map((s) => s.seasonId ?? 0);
    const s = seasons.find((x) => x.seasonId === data.season) ?? seasons.find((x) => (x.schedule ?? []).some(done)) ?? seasons[0];
    if (!s) return { error: error ?? "No data yet.", years, season: null as number | null, awards: [] as Award[] };
    const gs = games(L, s);
    const reg = gs.filter((g) => !g.playoff);
    const teams = (s.teams ?? []).map((t) => {
      const o = t.record?.overall ?? {};
      return { id: t.id ?? 0, team: L.teamName(t), managers: L.teamManagers(s, t).join(" & "), w: o.wins ?? 0, l: o.losses ?? 0, pf: o.pointsFor ?? 0, pa: o.pointsAgainst ?? 0, rank: t.rankCalculatedFinal ?? 0, seed: t.playoffSeed ?? 0 };
    });
    // all-play
    const weekly = new Map<number, { id: number; pts: number }[]>();
    for (const g of reg) for (const x of [g.home, g.away]) weekly.set(g.week, [...(weekly.get(g.week) ?? []), { id: x.teamId, pts: x.pts }]);
    const ap = new Map<number, number>();
    for (const list of weekly.values()) for (const a of list) ap.set(a.id, (ap.get(a.id) ?? 0) + list.filter((b) => b.id !== a.id && a.pts > b.pts).length / Math.max(1, list.length - 1));
    const luck = teams.map((t) => ({ ...t, luck: t.w - (ap.get(t.id) ?? 0) }));
    const scores = gs.flatMap((g) => [{ s: g.home, o: g.away, g }, { s: g.away, o: g.home, g }]);
    const weeksWon = new Map<number, number>();
    for (const list of weekly.values()) { const b = [...list].sort((a, b) => b.pts - a.pts)[0]; if (b) weeksWon.set(b.id, (weeksWon.get(b.id) ?? 0) + 1); }
    const moves = new Map<number, number>();
    for (const t of s.transactions ?? []) if (t.status === "EXECUTED" && t.teamId != null && ["WAIVER", "FREEAGENT"].includes(t.type ?? "")) moves.set(t.teamId, (moves.get(t.teamId) ?? 0) + 1);
    const trades = new Map<number, number>();
    for (const t of s.transactions ?? []) if (t.status === "EXECUTED" && t.type === "TRADE" && t.teamId != null) trades.set(t.teamId, (trades.get(t.teamId) ?? 0) + 1);

    const awards: Award[] = [];
    const push = (title: string, emoji: string, who: string | undefined, detail: string) => who && awards.push({ title, emoji, who, detail });
    const by = <T,>(arr: T[], f: (x: T) => number) => [...arr].sort((a, b) => f(b) - f(a))[0];
    const champ = teams.find((t) => t.rank === 1);
    push("Champion", "🏆", champ?.managers, champ ? `${champ.team} · ${champ.w}-${champ.l}` : "");
    const ru = teams.find((t) => t.rank === 2);
    push("Runner-up", "🥈", ru?.managers, ru ? `${ru.team} · so close` : "");
    const sacko = teams.filter((t) => t.rank > 0).sort((a, b) => b.rank - a.rank)[0];
    push("The Sacko", "🚽", sacko?.managers, sacko ? `${sacko.team} finished dead last` : "");
    const mvp = by(teams, (t) => t.pf);
    push("Scoring Title", "💥", mvp?.managers, mvp ? `${mvp.pf.toFixed(1)} points for` : "");
    const top1 = by(teams, (t) => t.seed ? -t.seed : -99);
    push("Regular-Season #1 Seed", "🥇", top1?.managers, top1 ? `${top1.w}-${top1.l}` : "");
    const lucky = by(luck, (t) => t.luck);
    push("Horseshoe Award (luckiest)", "🍀", lucky?.managers, lucky ? `${lucky.luck.toFixed(1)} more wins than their all-play record says` : "");
    const unlucky = by(luck, (t) => -t.luck);
    push("Black Cloud (unluckiest)", "🌧️", unlucky?.managers, unlucky ? `${(-unlucky.luck).toFixed(1)} fewer wins than deserved` : "");
    const pa = by(teams, (t) => t.pa);
    push("Punching Bag", "🥊", pa?.managers, pa ? `${pa.pa.toFixed(1)} points against` : "");
    const hi = by(scores, (x) => x.s.pts);
    push("Week of the Year", "🔥", hi?.s.managers, hi ? `${hi.s.pts.toFixed(2)} in week ${hi.g.week}` : "");
    const lo = by(scores, (x) => -x.s.pts);
    push("Dud of the Year", "💤", lo?.s.managers, lo ? `${lo.s.pts.toFixed(2)} in week ${lo.g.week}` : "");
    const bl = by(gs, (g) => Math.abs(g.home.pts - g.away.pts));
    if (bl) { const [w, l] = winLose(bl); push("Biggest Beatdown", "🔨", w.managers, `by ${(w.pts - l.pts).toFixed(2)} over ${l.managers}, week ${bl.week}`); }
    const hb = by(gs.filter((g) => g.home.pts !== g.away.pts), (g) => -Math.abs(g.home.pts - g.away.pts));
    if (hb) { const [w, l] = winLose(hb); push("Heartbreak Award", "💔", l.managers, `lost by ${(w.pts - l.pts).toFixed(2)} to ${w.managers}, week ${hb.week}`); }
    const ww = by([...weeksWon], ([, n]) => n);
    if (ww) { const t = teams.find((x) => x.id === ww[0]); push("Weekly High Score King", "👑", t?.managers, `top score in ${ww[1]} weeks`); }
    const mv = by([...moves], ([, n]) => n);
    if (mv) { const t = teams.find((x) => x.id === mv[0]); push("Waiver Wire Hawk", "🦅", t?.managers, `${mv[1]} pickups`); }
    const tr = by([...trades], ([, n]) => n);
    if (tr) { const t = teams.find((x) => x.id === tr[0]); push("Trade Machine", "🔁", t?.managers, `${tr[1]} trades`); }
    return { error: null as string | null, years, season: s.seasonId ?? null, awards };
  });

/* ---------------- Newsletter ---------------- */
export type Story = { headline: string; body: string; home: Side; away: Side };
const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length]!;

function recap(g: Game, avg: number, seed: number): Story {
  const [w, l] = winLose(g);
  const m = w.pts - l.pts;
  const W = w.managers, Lo = l.managers;
  let headline: string, body: string;
  if (m < 5) {
    headline = pick([`${W} Survives Nail-Biter`, `Photo Finish: ${W} Edges ${Lo}`, `${Lo} Comes Up Inches Short`], seed);
    body = `In the closest game on the slate, ${W} held on ${w.pts.toFixed(2)}–${l.pts.toFixed(2)}. A margin of just ${m.toFixed(2)} points means ${Lo} will be staring at their bench all week wondering what could have been.`;
  } else if (m > 50) {
    headline = pick([`${W} Obliterates ${Lo}`, `Massacre: ${W} Wins by ${m.toFixed(0)}`, `${Lo} Left in Ruins`], seed);
    body = `This one was over early. ${W} dropped ${w.pts.toFixed(2)} on ${Lo}, who managed only ${l.pts.toFixed(2)}. The ${m.toFixed(1)}-point margin will be talked about in the group chat for weeks.`;
  } else if (l.pts > avg) {
    headline = pick([`${W} Outguns ${Lo} in Shootout`, `Fireworks as ${W} Tops ${Lo}`], seed);
    body = `Both sides showed up. ${Lo} posted an above-average ${l.pts.toFixed(2)} and still lost, because ${W} went for ${w.pts.toFixed(2)}. Tough luck — that score beats most teams most weeks.`;
  } else if (w.pts < avg) {
    headline = pick([`${W} Wins Ugly`, `Sloppy Victory for ${W}`, `${W} Escapes With a Below-Average Win`], seed);
    body = `Nobody will frame this one. ${W} won with a modest ${w.pts.toFixed(2)}, but ${Lo}'s ${l.pts.toFixed(2)} made it easy. A win is a win.`;
  } else {
    headline = pick([`${W} Handles ${Lo}`, `Business as Usual for ${W}`, `${W} Takes Care of ${Lo}`], seed);
    body = `${W} took this one ${w.pts.toFixed(2)}–${l.pts.toFixed(2)}, winning by ${m.toFixed(2)}. ${Lo} needs a better showing next week.`;
  }
  return { headline, body, home: g.home, away: g.away };
}

export const getNewsletter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { season?: number | undefined; week?: number | undefined }) => ({
    season: Number.isInteger(i?.season) ? i.season : undefined,
    week: Number.isInteger(i?.week) ? i.week : undefined,
  }))
  .handler(async ({ data }) => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    const years = seasons.filter((s) => (s.schedule ?? []).some(done)).map((s) => s.seasonId ?? 0);
    const s = seasons.find((x) => x.seasonId === data.season && (x.schedule ?? []).some(done)) ?? seasons.find((x) => (x.schedule ?? []).some(done));
    const empty = { error: error ?? "No completed weeks yet.", years, season: null as number | null, week: 0, weeks: [] as number[], issue: null };
    if (!s) return empty;
    const gs = games(L, s);
    const weeks = [...new Set(gs.map((g) => g.week))].sort((a, b) => a - b);
    const week = data.week && weeks.includes(data.week) ? data.week : weeks[weeks.length - 1]!;
    const wk = gs.filter((g) => g.week === week);
    if (!wk.length) return { ...empty, season: s.seasonId ?? null, weeks };
    const scores = wk.flatMap((g) => [{ s: g.home, o: g.away }, { s: g.away, o: g.home }]);
    const avg = scores.reduce((a, b) => a + b.s.pts, 0) / scores.length;
    const seasonScores = gs.flatMap((g) => [g.home.pts, g.away.pts]);
    const seasonAvg = seasonScores.reduce((a, b) => a + b, 0) / seasonScores.length;
    const sorted = [...scores].sort((a, b) => b.s.pts - a.s.pts);
    const best = sorted[0]!, worst = sorted[sorted.length - 1]!;
    const stories = wk.map((g, i) => recap(g, avg, week * 7 + i)).sort((a, b) => Math.abs(b.home.pts - b.away.pts) - Math.abs(a.home.pts - a.away.pts));
    const lead = stories[0]!;
    // standings through this week
    const rec = new Map<number, { team: string; managers: string; w: number; l: number; pf: number }>();
    for (const g of gs.filter((x) => x.week <= week && !x.playoff)) {
      const [w, l] = winLose(g);
      for (const [x, win] of [[w, true], [l, false]] as const) {
        const r = rec.get(x.teamId) ?? { team: x.team, managers: x.managers, w: 0, l: 0, pf: 0 };
        if (win) r.w++; else r.l++;
        r.pf += x.pts;
        rec.set(x.teamId, r);
      }
    }
    const standings = [...rec.values()].sort((a, b) => b.w - a.w || b.pf - a.pf).map((r) => ({ ...r, pf: r2(r.pf) }));
    const unluckiest = [...scores].filter((x) => x.s.pts < x.o.pts).sort((a, b) => b.s.pts - a.s.pts)[0];
    const luckiest = [...scores].filter((x) => x.s.pts > x.o.pts).sort((a, b) => a.s.pts - b.s.pts)[0];
    const moves = (s.transactions ?? []).filter((t) => t.status === "EXECUTED").length;
    const issue = {
      volume: years.indexOf(s.seasonId ?? 0) >= 0 ? s.seasonId! - Math.min(...years) + 1 : 1,
      lead,
      stories: stories.slice(1),
      topScorer: { who: best.s.managers, pts: best.s.pts },
      bust: { who: worst.s.managers, pts: worst.s.pts },
      unluckiest: unluckiest ? { who: unluckiest.s.managers, pts: unluckiest.s.pts } : null,
      luckiest: luckiest ? { who: luckiest.s.managers, pts: luckiest.s.pts } : null,
      avg: r2(avg),
      seasonAvg: r2(seasonAvg),
      standings,
      moves,
      editorial:
        avg > seasonAvg
          ? `Scoring was up this week — the league averaged ${avg.toFixed(1)} points, ${(avg - seasonAvg).toFixed(1)} above the season norm. Offenses everywhere ate.`
          : `A quieter week across the league: teams averaged ${avg.toFixed(1)} points, ${(seasonAvg - avg).toFixed(1)} below the season norm. Defenses (and bad start/sit decisions) ruled the day.`,
    };
    return { error: null as string | null, years, season: s.seasonId ?? null, week, weeks, issue };
  });
