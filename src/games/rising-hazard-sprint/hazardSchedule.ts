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
    | {
        type: "sweeper";
        params: {
          center: { x: number; y: number; z: number };
          length: number;
          thickness: number;
          y: number;
          /** radians per second */
          angularSpeed: number;
          knockback: number;
          lift: number;
        };
      }
    | {
        type: "falling_tiles";
        params: {
          origin: { x: number; y: number; z: number };
          width: number;
          depth: number;
          tileSize: number;
          gap: number;
          dropDelayMs: number;
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
  roundDurationMs: 90_000,
  phases: [
    {
      tMs: 0,
      add: [
        {
          type: "rising_kill_height",
          // Panic ramp: starts threatening quickly.
          params: { startHeight: 0, riseRate: 0.22 },
        },
        {
          type: "sweeper",
          // Immediate chaos: rotating bar forcing movement + mistakes.
          params: {
            center: { x: 0, y: 0, z: 0 },
            length: 26,
            thickness: 1.2,
            y: 3,
            angularSpeed: 2.6,
            knockback: 18,
            lift: 6,
          },
        },
      ],
    },
    {
      tMs: 18_000,
      add: [
        {
          type: "falling_tiles",
          params: {
            origin: { x: 0, y: 8, z: 0 },
            width: 5,
            depth: 5,
            tileSize: 3,
            gap: 0.25,
            dropDelayMs: 650,
          },
        },
      ],
    },
  ],
};
