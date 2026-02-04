export type WeeklyProgress = {
  weekKey: string;
  playCount: number;
  surviveSecondsBest: number;
  finishedOnce: boolean;
};

export function currentWeekKey(now = new Date()): string {
  // ISO week key: YYYY-Www
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Thursday in current week decides the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const yyyy = d.getUTCFullYear();
  return `${yyyy}-W${String(weekNo).padStart(2, "0")}`;
}

export function parseWeekly(data: Record<string, unknown> | undefined): WeeklyProgress {
  const wk = currentWeekKey();
  const stored = typeof data?.rhs_weekKey === "string" ? (data.rhs_weekKey as string) : wk;

  // If stored week differs, reset.
  if (stored !== wk) {
    return { weekKey: wk, playCount: 0, surviveSecondsBest: 0, finishedOnce: false };
  }

  return {
    weekKey: wk,
    playCount: typeof data?.rhs_week_playCount === "number" ? (data.rhs_week_playCount as number) : 0,
    surviveSecondsBest:
      typeof data?.rhs_week_surviveBest === "number" ? (data.rhs_week_surviveBest as number) : 0,
    finishedOnce: typeof data?.rhs_week_finishedOnce === "boolean" ? (data.rhs_week_finishedOnce as boolean) : false,
  };
}

export function weeklyPersistPatch(w: WeeklyProgress): Record<string, unknown> {
  return {
    rhs_weekKey: w.weekKey,
    rhs_week_playCount: w.playCount,
    rhs_week_surviveBest: w.surviveSecondsBest,
    rhs_week_finishedOnce: w.finishedOnce,
  };
}
