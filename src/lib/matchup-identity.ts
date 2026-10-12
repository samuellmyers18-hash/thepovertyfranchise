export type MatchupIdentityFields = {
  season: number;
  week: number;
  homeId: number;
  awayId: number;
};

/** Stable within a league: the same teams, season, and scoring week share a key. */
export function matchupIdentityKey({ season, week, homeId, awayId }: MatchupIdentityFields) {
  const [firstTeamId, secondTeamId] = [homeId, awayId].sort((a, b) => a - b);
  return JSON.stringify([season, week, firstTeamId, secondTeamId]);
}

export function dedupeMatchups<T extends MatchupIdentityFields>(matchups: T[]): T[] {
  const unique = new Map<string, T>();
  for (const matchup of matchups) {
    const identity = matchupIdentityKey(matchup);
    if (!unique.has(identity)) unique.set(identity, matchup);
  }
  return [...unique.values()];
}
