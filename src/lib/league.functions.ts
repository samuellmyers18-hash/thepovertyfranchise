import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RawMatch, RawSeason, RawTeam } from "./league.server";

function mKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ManagerSeason = {
  season: number;
  teamId: number;
  teamName: string;
  coManagers: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  finalRank: number | null;
  seed: number | null;
};
export type ManagerSummary = {
  key: string;
  name: string;
  seasons: ManagerSeason[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
  bestFinish: number | null;
  claimedBy: string | null;
};

async function lib() {
  return import("./league.server");
}

type Ctx = Awaited<ReturnType<typeof lib>>;

function done(m: RawMatch) {
  return m.winner === "HOME" || m.winner === "AWAY" || m.winner === "TIE";
}
function regular(m: RawMatch) {
  return !m.playoffTierType || m.playoffTierType === "NONE";
}

function buildManagers(L: Ctx, seasons: RawSeason[]): ManagerSummary[] {
  const map = new Map<string, ManagerSummary>();
  for (const s of seasons) {
    for (const t of s.teams ?? []) {
      const names = L.teamManagers(s, t);
      const rec = t.record?.overall ?? {};
      for (const n of names) {
        const key = mKey(n);
        const m =
          map.get(key) ??
          ({ key, name: n, seasons: [], wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, championships: 0, bestFinish: null, claimedBy: null } as ManagerSummary);
        const row: ManagerSeason = {
          season: s.seasonId ?? 0,
          teamId: t.id ?? 0,
          teamName: L.teamName(t),
          coManagers: names.filter((x) => x !== n),
          wins: rec.wins ?? 0,
          losses: rec.losses ?? 0,
          ties: rec.ties ?? 0,
          pointsFor: r2(rec.pointsFor ?? 0),
          pointsAgainst: r2(rec.pointsAgainst ?? 0),
          finalRank: t.rankCalculatedFinal || null,
          seed: t.playoffSeed || null,
        };
        m.seasons.push(row);
        m.wins += row.wins;
        m.losses += row.losses;
        m.ties += row.ties;
        m.pointsFor += row.pointsFor;
        m.pointsAgainst += row.pointsAgainst;
        if (row.finalRank === 1) m.championships++;
        if (row.finalRank && (m.bestFinish === null || row.finalRank < m.bestFinish)) m.bestFinish = row.finalRank;
        map.set(key, m);
      }
    }
  }
  return [...map.values()]
    .map((m) => ({ ...m, pointsFor: r2(m.pointsFor), pointsAgainst: r2(m.pointsAgainst), seasons: m.seasons.sort((a, b) => b.season - a.season) }))
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
}

export const getManagers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    const managers = buildManagers(L, seasons);
    const { data: claims } = await context.supabase.from("manager_claims").select("manager_key, user_id");
    const claimMap = new Map((claims ?? []).map((c) => [c.manager_key, c.user_id]));
    const myClaim = (claims ?? []).find((c) => c.user_id === context.userId)?.manager_key ?? null;
    return { error, myClaim, userId: context.userId, managers: managers.map((m) => ({ ...m, claimedBy: claimMap.get(m.key) ?? null })) };
  });

export const claimManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; name: string }) => ({
    key: mKey(String(input?.key ?? "")).slice(0, 80),
    name: String(input?.name ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    if (!data.key) return { ok: false, error: "Pick a manager." };
    const { error } = await context.supabase.from("manager_claims").insert({ manager_key: data.key, manager_name: data.name, user_id: context.userId });
    if (error) return { ok: false, error: error.code === "23505" ? "That manager is taken, or you already claimed one." : "Couldn't claim that manager." };
    return { ok: true };
  });

export const releaseManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => ({ key: mKey(String(input?.key ?? "")) }))
  .handler(async ({ data, context }) => {
    await context.supabase.from("manager_claims").delete().eq("manager_key", data.key);
    return { ok: true };
  });

// ---------- Home: standings, power rankings, fun facts ----------

export type StandingRow = { teamId: number; team: string; managers: string; wins: number; losses: number; ties: number; pf: number; pa: number; streak: string };
export type PowerRow = StandingRow & { rank: number; score: number; allPlay: string; recentAvg: number; note: string };
export type FunFact = { title: string; value: string; detail: string };
export type WeekPoint = { week: number; avg: number; high: number; highWho: string };
export type TopScore = { who: string; pts: number; season: number; week: number };
export type PointsLeader = { name: string; pts: number; seasons: number };
export type MatchupRow = { homeTeam: string; awayTeam: string; homeManagers: string[]; awayManagers: string[]; homePts: number; awayPts: number; homeProj?: number | null; awayProj?: number | null };
export type MoveRow = { kind: "Waiver" | "Free agent" | "Trade"; date: string; team: string; managers: string[]; players: string; bid: number | null };

export const getLeagueHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    if (!seasons.length) return { error: error ?? "No data yet.", season: null, week: 0, standings: [], power: [], facts: [], trend: [], topScores: [], pointsLeaders: [], matchups: [], featured: null, moves: [] };

    // Use the newest season with completed games.
    const cur: RawSeason = seasons.find((s) => (s.schedule ?? []).some(done)) ?? seasons[0]!;
    const teams = cur.teams ?? [];
    const label = (t: RawTeam) => ({ team: L.teamName(t), managers: L.teamManagers(cur, t).join(" & ") });
    const games = (cur.schedule ?? []).filter((m) => done(m) && regular(m));
    const scores = new Map<number, Map<number, number>>(); // week -> team -> pts
    for (const g of games) {
      for (const wk of L.matchWeeks(g)) {
        if (!scores.has(wk.period)) scores.set(wk.period, new Map());
        if (g.home?.teamId != null) scores.get(wk.period)!.set(g.home.teamId, wk.homePts);
        if (g.away?.teamId != null) scores.get(wk.period)!.set(g.away.teamId, wk.awayPts);
      }
    }
    const weeks = [...scores.keys()].sort((a, b) => a - b);
    const lastWeek = weeks[weeks.length - 1] ?? 0;

    const standings: StandingRow[] = teams
      .map((t) => {
        const o = t.record?.overall ?? {};
        return {
          teamId: t.id ?? 0,
          ...label(t),
          wins: o.wins ?? 0,
          losses: o.losses ?? 0,
          ties: o.ties ?? 0,
          pf: r2(o.pointsFor ?? 0),
          pa: r2(o.pointsAgainst ?? 0),
          streak: o.streakLength ? `${o.streakType === "WIN" ? "W" : o.streakType === "LOSS" ? "L" : "T"}${o.streakLength}` : "—",
        };
      })
      .sort((a, b) => b.wins - a.wins || b.pf - a.pf);

    // Power score: 40% all-play win rate, 30% actual win rate, 30% last-3-week scoring vs league best.
    const recentWeeks = weeks.slice(-3);
    const raw = standings.map((s) => {
      let apW = 0, apG = 0;
      for (const w of weeks) {
        const wk = scores.get(w)!;
        const mine = wk.get(s.teamId);
        if (mine == null) continue;
        for (const [tid, p] of wk) if (tid !== s.teamId) { apG++; if (mine > p) apW++; else if (mine === p) apW += 0.5; }
      }
      const rs = recentWeeks.map((w) => scores.get(w)?.get(s.teamId)).filter((x): x is number => x != null);
      const recentAvg = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
      const g = s.wins + s.losses + s.ties;
      return { s, apRate: apG ? apW / apG : 0, apW, apL: apG - apW, winRate: g ? (s.wins + s.ties / 2) / g : 0, recentAvg };
    });
    const maxRecent = Math.max(1, ...raw.map((r) => r.recentAvg));
    const power: PowerRow[] = raw
      .map((r) => {
        const score = 0.4 * r.apRate + 0.3 * r.winRate + 0.3 * (r.recentAvg / maxRecent);
        const luck = r.winRate - r.apRate;
        const note = luck > 0.12 ? "Riding some luck" : luck < -0.12 ? "Better than the record" : r.recentAvg === maxRecent ? "Hottest offense" : "";
        return { ...r.s, rank: 0, score: Math.round(score * 1000) / 10, allPlay: `${Math.round(r.apW)}-${Math.round(r.apL)}`, recentAvg: r2(r.recentAvg), note };
      })
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 }));

    // Fun facts across every season.
    type G = { season: number; week: number; w: string; l: string; ws: number; ls: number; hi: { who: string; pts: number }; lo: { who: string; pts: number } };
    const all: G[] = [];
    for (const s of seasons) {
      const byId = new Map((s.teams ?? []).map((t) => [t.id, `${L.teamManagers(s, t).join(" & ") || L.teamName(t)}`]));
      for (const m of s.schedule ?? []) {
        if (!done(m) || m.home?.teamId == null || m.away?.teamId == null) continue;
        for (const wk of L.matchWeeks(m)) {
          const h = { who: byId.get(m.home.teamId) ?? "?", pts: wk.homePts };
          const a = { who: byId.get(m.away.teamId) ?? "?", pts: wk.awayPts };
          const [hi, lo] = h.pts >= a.pts ? [h, a] : [a, h];
          all.push({ season: s.seasonId ?? 0, week: wk.period, w: hi.who, l: lo.who, ws: hi.pts, ls: lo.pts, hi, lo });
        }
      }
    }
    const facts: FunFact[] = [];
    const pick = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | null>((b, x) => (b === null || f(x) > f(b) ? x : b), null);
    const top = pick(all, (g) => g.ws);
    if (top) facts.push({ title: "Highest score ever", value: top.ws.toFixed(2), detail: `${top.w} · ${top.season} week ${top.week}` });
    const low = pick(all.filter((g) => g.ls > 0), (g) => -g.ls);
    if (low) facts.push({ title: "Lowest score ever", value: low.ls.toFixed(2), detail: `${low.l} · ${low.season} week ${low.week}` });
    const blow = pick(all, (g) => g.ws - g.ls);
    if (blow) facts.push({ title: "Biggest blowout", value: `+${(blow.ws - blow.ls).toFixed(2)}`, detail: `${blow.w} over ${blow.l} · ${blow.season} wk ${blow.week}` });
    const close = pick(all.filter((g) => g.ws !== g.ls), (g) => -(g.ws - g.ls));
    if (close) facts.push({ title: "Closest game", value: `${(close.ws - close.ls).toFixed(2)} pts`, detail: `${close.w} edged ${close.l} · ${close.season} wk ${close.week}` });
    const mgrs = buildManagers(L, seasons);
    const champ = pick(mgrs, (m) => m.championships);
    if (champ && champ.championships) facts.push({ title: "Most titles", value: String(champ.championships), detail: champ.name });
    const best = pick(mgrs.filter((m) => m.wins + m.losses >= 10), (m) => m.wins / (m.wins + m.losses + m.ties));
    if (best) facts.push({ title: "Best career win %", value: ((best.wins / (best.wins + best.losses + best.ties)) * 100).toFixed(1) + "%", detail: best.name });
    const thisWeek = all.filter((g) => g.season === cur.seasonId && g.week === lastWeek);
    const wkTop = pick(thisWeek, (g) => g.ws);
    if (wkTop) facts.push({ title: `Week ${lastWeek} top score`, value: wkTop.ws.toFixed(2), detail: wkTop.w });
    const wkLow = pick(thisWeek, (g) => -g.ls);
    if (wkLow) facts.push({ title: `Week ${lastWeek} basement`, value: wkLow.ls.toFixed(2), detail: wkLow.l });
    facts.push({ title: "Games on record", value: String(all.length), detail: `${seasons.length} seasons` });

    // Weekly scoring trend for the current season (league average + weekly high).
    const trend: WeekPoint[] = weeks.map((w) => {
      const wk = scores.get(w)!;
      const vals = [...wk.values()];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      let high = 0, highWho = "";
      for (const [tid, p] of wk) if (p > high) { high = p; highWho = teams.find((t) => t.id === tid) ? label(teams.find((t) => t.id === tid)!).managers : ""; }
      return { week: w, avg: r2(avg), high: r2(high), highWho };
    });

    // Top 5 single-week scores of all time.
    const topScores: TopScore[] = [...all]
      .sort((a, b) => b.ws - a.ws)
      .slice(0, 5)
      .map((g) => ({ who: g.w, pts: r2(g.ws), season: g.season, week: g.week }));

    // Career points-for leaders.
    const pointsLeaders: PointsLeader[] = mgrs
      .map((m) => ({ name: m.name, pts: r2(m.pointsFor), seasons: m.seasons.length }))
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 5);

    // Current week's matchups (live or upcoming); featured = highest combined score/projection.
    const currentWeek = cur.status?.currentMatchupPeriod ?? lastWeek;
    const matchups: MatchupRow[] = [];
    for (const g of games) {
      if (g.home?.teamId == null || g.away?.teamId == null) continue;
      const ht = teams.find((t) => t.id === g.home!.teamId);
      const at = teams.find((t) => t.id === g.away!.teamId);
      if (!ht || !at) continue;
      for (const wk of L.matchWeeks(g)) {
        if (wk.period !== currentWeek) continue;
        matchups.push({
          homeTeam: label(ht).team, awayTeam: label(at).team,
          homeManagers: L.teamManagers(cur, ht), awayManagers: L.teamManagers(cur, at),
          homePts: r2(wk.homePts), awayPts: r2(wk.awayPts),
          homeProj: g.home!.totalProjectedPointsLive != null ? r2(g.home!.totalProjectedPointsLive) : null,
          awayProj: g.away!.totalProjectedPointsLive != null ? r2(g.away!.totalProjectedPointsLive) : null,
        });
      }
    }
    const featured = matchups.reduce<MatchupRow | null>((b, m) => {
      const score = (x: MatchupRow) => (x.homePts + x.awayPts > 0 ? x.homePts + x.awayPts : (x.homeProj ?? 0) + (x.awayProj ?? 0));
      return b === null || score(m) > score(b) ? m : b;
    }, null);

    // Recent roster moves (waivers, free agents, trades) from the current season.
    const txns = (cur.transactions ?? [])
      .filter((t) => (t.status ?? "EXECUTED") === "EXECUTED" && ["WAIVER", "FREEAGENT", "TRADE"].includes(t.type ?? ""))
      .sort((a, b) => (b.proposedDate ?? 0) - (a.proposedDate ?? 0))
      .slice(0, 12);
    const pids = [...new Set(txns.flatMap((t) => (t.items ?? []).map((i) => i.playerId ?? 0)).filter(Boolean))];
    const playerNames = await L.loadPlayerNames(cur.seasonId ?? 0, pids);
    const pname = (id?: number) => playerNames[id ?? 0] ?? "Unknown";
    const teamLabel = (id?: number) => {
      const t = teams.find((x) => x.id === id);
      return t ? { team: label(t).team, managers: L.teamManagers(cur, t) } : { team: "?", managers: [] as string[] };
    };
    const moves: MoveRow[] = txns.map((t) => {
        const date = new Date(t.proposedDate ?? 0).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (t.type === "TRADE") {
          const adds = (t.items ?? []).filter((i) => i.type === "ADD");
          const byTo = new Map<number, string[]>();
          for (const i of adds) {
            const to = i.toTeamId ?? 0;
            byTo.set(to, [...(byTo.get(to) ?? []), pname(i.playerId)]);
          }
          return {
            kind: "Trade" as const, date,
            team: [...byTo.keys()].map((id) => teamLabel(id).team).join(" ↔ "),
            managers: [...new Set([...byTo.keys()].flatMap((id) => teamLabel(id).managers))],
            players: [...byTo.entries()].map(([id, ps]) => `${teamLabel(id).team} gets ${ps.join(", ")}`).join(" · "),
            bid: null,
          };
        }
        const add = (t.items ?? []).find((i) => i.type === "ADD");
        const drop = (t.items ?? []).find((i) => i.type === "DROP");
        const who = teamLabel(t.teamId ?? add?.toTeamId);
        const parts = [
          add ? `+ ${pname(add.playerId)}` : null,
          drop ? `− ${pname(drop.playerId)}` : null,
        ].filter(Boolean).join(" / ");
        return { kind: t.type === "WAIVER" ? ("Waiver" as const) : ("Free agent" as const), date, team: who.team, managers: who.managers, players: parts, bid: t.type === "WAIVER" ? (t.bidAmount ?? null) : null };
      });

    return { error, season: cur.seasonId ?? null, week: currentWeek, standings, power, facts, trend, topScores, pointsLeaders, matchups, featured, moves };
  });

// ---------- Rivalries ----------

export type Rivalry = { a: string; b: string; games: number; aWins: number; bWins: number; ties: number; aPts: number; bPts: number; avgMargin: number; last: string; playoffGames: number; aBest: number; bBest: number; biggestWin: number; closest: number | null; seasonCount: number };

export const getRivalries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    type RivalryAcc = Omit<Rivalry, "closest" | "seasonCount"> & { closest: number; seasons: Set<number> };
    const map = new Map<string, RivalryAcc>();
    for (const s of [...seasons].sort((x, y) => (x.seasonId ?? 0) - (y.seasonId ?? 0))) {
      const byId = new Map((s.teams ?? []).map((t) => [t.id, L.teamManagers(s, t)]));
      for (const m of s.schedule ?? []) {
        if (!done(m) || m.home?.teamId == null || m.away?.teamId == null) continue;
        const hm = byId.get(m.home.teamId) ?? [];
        const am = byId.get(m.away.teamId) ?? [];
        for (const h of hm) for (const a of am) {
          if (h === a) continue;
          const [x, y] = (h < a ? [h, a] : [a, h]) as [string, string];
          const flip = x !== h;
          for (const wk of L.matchWeeks(m)) {
            const xp = flip ? wk.awayPts : wk.homePts;
            const yp = flip ? wk.homePts : wk.awayPts;
            const k = `${x}|${y}`;
            const r = map.get(k) ?? { a: x, b: y, games: 0, aWins: 0, bWins: 0, ties: 0, aPts: 0, bPts: 0, avgMargin: 0, last: "", playoffGames: 0, aBest: 0, bBest: 0, biggestWin: 0, closest: Infinity, seasons: new Set<number>() };
            r.games++;
            if (xp > yp) r.aWins++; else if (yp > xp) r.bWins++; else r.ties++;
            r.aPts += xp;
            r.bPts += yp;
            r.aBest = Math.max(r.aBest, xp);
            r.bBest = Math.max(r.bBest, yp);
            if (xp !== yp) {
              r.biggestWin = Math.max(r.biggestWin, Math.abs(xp - yp));
              r.closest = Math.min(r.closest, Math.abs(xp - yp));
            }
            r.seasons.add(s.seasonId ?? 0);
            if (!regular(m)) r.playoffGames++;
            r.last = `${s.seasonId} wk ${wk.period}: ${xp > yp ? x : y} ${Math.max(xp, yp).toFixed(1)}–${Math.min(xp, yp).toFixed(1)}`;
            map.set(k, r);
          }
        }
      }
    }
    const rivalries: Rivalry[] = [...map.values()]
      .map(({ seasons, closest, ...r }) => ({ ...r, aPts: r2(r.aPts), bPts: r2(r.bPts), avgMargin: r2(Math.abs(r.aPts - r.bPts) / r.games), closest: closest === Infinity ? null : r2(closest), seasonCount: seasons.size }))
      .sort((p, q) => q.games - p.games || p.avgMargin - q.avgMargin);
    return { error, rivalries };
  });

// ---------- Draft recaps ----------

export type DraftPick = { overall: number; round: number; pick: number; team: string; managers: string; player: string; keeper: boolean };

export const getDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { season?: number | undefined }) => ({ season: Number.isInteger(input?.season) ? input.season : undefined }))
  .handler(async ({ data }) => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    const withDraft = seasons.filter((s) => (s.draftDetail?.picks ?? []).length > 0);
    const years = withDraft.map((s) => s.seasonId ?? 0);
    const s = withDraft.find((x) => x.seasonId === data.season) ?? withDraft[0];
    if (!s) return { error: error ?? "No drafts found.", years, season: null, picks: [] as DraftPick[] };
    const raw = s.draftDetail!.picks!;
    const names = await L.loadPlayerNames(s.seasonId ?? 0, raw.map((p) => p.playerId ?? 0).filter(Boolean));
    const byId = new Map((s.teams ?? []).map((t) => [t.id, t]));
    const picks: DraftPick[] = raw
      .map((p) => {
        const t = byId.get(p.teamId);
        return {
          overall: p.overallPickNumber ?? 0,
          round: p.roundId ?? 0,
          pick: p.roundPickNumber ?? 0,
          team: t ? L.teamName(t) : `Team ${p.teamId}`,
          managers: t ? L.teamManagers(s, t).join(" & ") : "",
          player: names[p.playerId ?? 0] ?? `Player #${p.playerId}`,
          keeper: Boolean(p.keeper),
        };
      })
      .sort((a, b) => a.overall - b.overall);
    return { error, years, season: s.seasonId ?? null, picks };
  });

// ---------- Rosters ----------

const SLOT_LABELS: Record<number, string> = {
  0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP",
  8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "DP",
  16: "D/ST", 17: "K", 18: "P", 19: "HC", 20: "Bench", 21: "IR", 23: "FLEX", 24: "EDR", 25: "RB",
};
const slotLabel = (id?: number) => SLOT_LABELS[id ?? -1] ?? `Slot ${id ?? "?"}`;

export type RosterPlayer = { name: string; slot: string; acquired: string | null };
export type RosterTeam = { teamId: number; team: string; managers: string[]; players: RosterPlayer[] };

export const getRosters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { season?: number | undefined; week?: number | undefined }) => ({
    season: Number.isInteger(input?.season) ? input.season : undefined,
    week: Number.isInteger(input?.week) ? input.week : undefined,
  }))
  .handler(async ({ data }) => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    const years = seasons.map((s) => s.seasonId ?? 0);
    const s = seasons.find((x) => x.seasonId === data.season) ?? seasons[0];
    if (!s) return { error: error ?? "No data yet.", years, season: null, week: 0, weeks: [] as number[], teams: [] as RosterTeam[] };
    const periodCount = s.settings?.scheduleSettings?.matchupPeriodCount ?? 17;
    const latest = Math.min(s.status?.latestScoringPeriod ?? periodCount, periodCount) || 1;
    const week = data.week && data.week >= 1 && data.week <= periodCount ? data.week : latest;
    const raw = await L.fetchRosterWeek(s.seasonId ?? 0, week);
    if (!raw) return { error: "Couldn't load rosters from ESPN for that week.", years, season: s.seasonId ?? null, week, weeks: Array.from({ length: periodCount }, (_, i) => i + 1), teams: [] as RosterTeam[] };
    const ids = [...new Set(raw.flatMap((t) => (t.roster?.entries ?? []).map((e) => e.playerId ?? 0)).filter(Boolean))];
    const names = await L.loadPlayerNames(s.seasonId ?? 0, ids);
    const byId = new Map((s.teams ?? []).map((t) => [t.id, t]));
    const teams: RosterTeam[] = raw
      .map((rt) => {
        const t = byId.get(rt.id);
        const players: RosterPlayer[] = (rt.roster?.entries ?? [])
          .map((e) => ({
            name: names[e.playerId ?? 0] ?? `Player #${e.playerId}`,
            slot: slotLabel(e.lineupSlotId),
            acquired: e.acquisitionDate ? new Date(e.acquisitionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
          }))
          .sort((a, b) => slotOrderFromLabel(a.slot) - slotOrderFromLabel(b.slot));
        return { teamId: rt.id ?? 0, team: t ? L.teamName(t) : `Team ${rt.id}`, managers: t ? L.teamManagers(s, t) : [], players };
      })
      .sort((a, b) => a.team.localeCompare(b.team));
    return { error, years, season: s.seasonId ?? null, week, weeks: Array.from({ length: periodCount }, (_, i) => i + 1), teams };
  });

function slotOrderFromLabel(slot: string) {
  if (slot === "Bench") return 50;
  if (slot === "IR") return 60;
  return 0;
}

// ---------- Single manager profile ----------

export const getManagerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => ({ key: mKey(String(input?.key ?? "")) }))
  .handler(async ({ data, context }) => {
    const L = await lib();
    const { seasons, error } = await L.loadAllSeasons();
    const manager = buildManagers(L, seasons).find((m) => m.key === data.key) ?? null;
    if (!manager) return { error: error ?? "Manager not found.", manager: null, facts: [] as FunFact[], claimed: false };
    const { data: claim } = await context.supabase.from("manager_claims").select("user_id").eq("manager_key", data.key).maybeSingle();

    type Gm = { season: number; week: number; me: number; opp: number; opps: string[]; playoff: boolean };
    const games: Gm[] = [];
    for (const s of [...seasons].sort((a, b) => (a.seasonId ?? 0) - (b.seasonId ?? 0))) {
      const byId = new Map((s.teams ?? []).map((t) => [t.id, L.teamManagers(s, t)]));
      for (const m of [...(s.schedule ?? [])].sort((a, b) => (a.matchupPeriodId ?? 0) - (b.matchupPeriodId ?? 0))) {
        if (!done(m) || m.home?.teamId == null || m.away?.teamId == null) continue;
        const hm = byId.get(m.home.teamId) ?? [], am = byId.get(m.away.teamId) ?? [];
        const isHome = hm.some((n) => mKey(n) === data.key), isAway = am.some((n) => mKey(n) === data.key);
        if (!isHome && !isAway) continue;
        for (const wk of L.matchWeeks(m)) {
          games.push({
            season: s.seasonId ?? 0, week: wk.period, playoff: !regular(m),
            me: isHome ? wk.homePts : wk.awayPts,
            opp: isHome ? wk.awayPts : wk.homePts,
            opps: isHome ? am : hm,
          });
        }
      }
    }
    const facts: FunFact[] = [];
    const best = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | null>((b, x) => (b === null || f(x) > f(b) ? x : b), null);
    const at = (g: Gm) => `${g.season} week ${g.week} vs ${g.opps.join(" & ")}`;
    const hi = best(games, (g) => g.me);
    if (hi) facts.push({ title: "Career-high score", value: hi.me.toFixed(2), detail: at(hi) });
    const lo = best(games.filter((g) => g.me > 0), (g) => -g.me);
    if (lo) facts.push({ title: "Career-low score", value: lo.me.toFixed(2), detail: at(lo) });
    const bw = best(games.filter((g) => g.me > g.opp), (g) => g.me - g.opp);
    if (bw) facts.push({ title: "Biggest win", value: `+${(bw.me - bw.opp).toFixed(2)}`, detail: at(bw) });
    const wl = best(games.filter((g) => g.me < g.opp), (g) => g.opp - g.me);
    if (wl) facts.push({ title: "Worst loss", value: `-${(wl.opp - wl.me).toFixed(2)}`, detail: at(wl) });
    let streak = 0, maxW = 0, lstreak = 0, maxL = 0;
    for (const g of games) {
      if (g.me > g.opp) { streak++; lstreak = 0; } else if (g.me < g.opp) { lstreak++; streak = 0; } else { streak = 0; lstreak = 0; }
      maxW = Math.max(maxW, streak); maxL = Math.max(maxL, lstreak);
    }
    facts.push({ title: "Longest win streak", value: String(maxW), detail: "games in a row" });
    facts.push({ title: "Longest losing streak", value: String(maxL), detail: "games in a row" });
    const vs = new Map<string, { w: number; l: number }>();
    for (const g of games) for (const o of g.opps) {
      const r = vs.get(o) ?? { w: 0, l: 0 };
      if (g.me > g.opp) r.w++; else if (g.me < g.opp) r.l++;
      vs.set(o, r);
    }
    const ent = [...vs.entries()];
    const fav = best(ent, ([, r]) => r.w - r.l);
    if (fav && fav[1].w > fav[1].l) facts.push({ title: "Favorite victim", value: `${fav[1].w}-${fav[1].l}`, detail: fav[0] });
    const nem = best(ent, ([, r]) => r.l - r.w);
    if (nem && nem[1].l > nem[1].w) facts.push({ title: "Nemesis", value: `${nem[1].w}-${nem[1].l}`, detail: nem[0] });
    const po = games.filter((g) => g.playoff);
    if (po.length) facts.push({ title: "Playoff record", value: `${po.filter((g) => g.me > g.opp).length}-${po.filter((g) => g.me < g.opp).length}`, detail: `${po.length} playoff games` });
    if (games.length) facts.push({ title: "Avg points per game", value: (games.reduce((a, g) => a + g.me, 0) / games.length).toFixed(1), detail: `${games.length} games` });
    const luck = games.filter((g) => g.me < g.opp && g.me > 0).length ? best(games.filter((g) => g.me < g.opp), (g) => g.me) : null;
    if (luck) facts.push({ title: "Unluckiest loss", value: luck.me.toFixed(2), detail: `Lost anyway · ${at(luck)}` });

    return { error, manager, facts, claimed: Boolean(claim) };
  });
