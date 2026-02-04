export type PlayerProfile = {
  tokens: number;
  bestSurvivalMs: number;
};

export function parseProfile(data: Record<string, unknown> | undefined): PlayerProfile {
  const tokens = typeof data?.rhs_tokens === "number" ? data.rhs_tokens : 0;
  const bestSurvivalMs = typeof data?.rhs_bestSurvivalMs === "number" ? data.rhs_bestSurvivalMs : 0;
  return { tokens, bestSurvivalMs };
}

export function toPersistPatch(profile: PlayerProfile): Record<string, unknown> {
  return {
    rhs_tokens: profile.tokens,
    rhs_bestSurvivalMs: profile.bestSurvivalMs,
  };
}
