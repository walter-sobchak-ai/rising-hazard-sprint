export type HazardPhase = {
  /** milliseconds since RUNNING phase started */
  tMs: number;
  add?: Array<
    | {
        type: "rising_kill_height";
        params: {
          startHeight: number;
          /** units per second */
          riseRate: number;
        };
      }
  >;
};

export type HazardSchedule = {
  version: 1;
  roundDurationMs: number;
  phases: HazardPhase[];
};

/**
 * v1 schedule: rising kill-height only.
 *
 * Tuning knobs:
 * - startHeight: raise to make early game easier
 * - riseRate: higher = faster pressure
 */
export const DEFAULT_SCHEDULE: HazardSchedule = {
  version: 1,
  roundDurationMs: 120_000,
  phases: [
    {
      tMs: 0,
      add: [
        {
          type: "rising_kill_height",
          params: { startHeight: -5, riseRate: 0.08 },
        },
      ],
    },
  ],
};
