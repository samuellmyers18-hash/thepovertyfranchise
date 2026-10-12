import type { RawSeason, RawTeam } from "./league.server";

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

type Helpers = {
  teamManagers: (season: RawSeason, team: RawTeam) => string[];
  teamName: (team: RawTeam) => string;
};

const managerKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildManagers(seasons: RawSeason[], helpers: Helpers): ManagerSummary[] {
  const managers = new Map<string, ManagerSummary>();
  for (const season of seasons) {
    for (const team of season.teams ?? []) {
      const namesByKey = new Map<string, string>();
      for (const name of helpers.teamManagers(season, team)) {
        const key = managerKey(name);
        if (key) namesByKey.set(key, namesByKey.get(key) ?? name);
      }
      const names = [...namesByKey.values()];
      const record = team.record?.overall ?? {};
      for (const name of names) {
        const key = managerKey(name);
        const manager =
          managers.get(key) ??
          ({
            key,
            name,
            seasons: [],
            wins: 0,
            losses: 0,
            ties: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            championships: 0,
            bestFinish: null,
            claimedBy: null,
          } satisfies ManagerSummary);
        const row: ManagerSeason = {
          season: season.seasonId ?? 0,
          teamId: team.id ?? 0,
          teamName: helpers.teamName(team),
          coManagers: names.filter((other) => managerKey(other) !== key),
          wins: record.wins ?? 0,
          losses: record.losses ?? 0,
          ties: record.ties ?? 0,
          pointsFor: round2(record.pointsFor ?? 0),
          pointsAgainst: round2(record.pointsAgainst ?? 0),
          finalRank: team.rankCalculatedFinal || null,
          seed: team.playoffSeed || null,
        };
        manager.seasons.push(row);
        manager.wins += row.wins;
        manager.losses += row.losses;
        manager.ties += row.ties;
        manager.pointsFor += row.pointsFor;
        manager.pointsAgainst += row.pointsAgainst;
        if (row.finalRank === 1) manager.championships++;
        if (row.finalRank && (manager.bestFinish === null || row.finalRank < manager.bestFinish)) {
          manager.bestFinish = row.finalRank;
        }
        managers.set(key, manager);
      }
    }
  }
  return [...managers.values()]
    .map((manager) => ({
      ...manager,
      pointsFor: round2(manager.pointsFor),
      pointsAgainst: round2(manager.pointsAgainst),
      seasons: manager.seasons.sort((a, b) => b.season - a.season),
    }))
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
}
