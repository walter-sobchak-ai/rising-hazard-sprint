import type { World } from "hytopia";

import type { HazardSchedule } from "../hazardSchedule";
import type { HazardInstance } from "./types";
import { spawnSweeper } from "./sweeper";
import { spawnFallingTiles } from "./falling-tiles";

export type HazardDirector = {
  reset: (world: World, runningStartedAt: number) => void;
  update: (world: World, now: number, dtMs: number) => void;
  disposeAll: () => void;
};

export function createHazardDirector(params: {
  schedule: HazardSchedule;
}): HazardDirector {
  const { schedule } = params;

  let runningStartedAt = 0;
  let phaseIndex = 0;

  const actives: HazardInstance[] = [];
  const updaters: Array<(dtMs: number) => void> = [];

  const disposeAll = () => {
    for (const h of actives) h.dispose();
    actives.length = 0;
    updaters.length = 0;
  };

  const reset = (world: World, startedAt: number) => {
    disposeAll();
    runningStartedAt = startedAt;
    phaseIndex = 0;

    // Spawn any tMs=0 hazards immediately
    for (const phase of schedule.phases.filter((p) => p.tMs === 0)) {
      for (const add of phase.add ?? []) {
        // rising_kill_height is handled by game controller; ignore here.
        if (add.type === "sweeper") {
          const { instance, update } = spawnSweeper(world, add.params);
          actives.push(instance);
          updaters.push(update);
        }
        if (add.type === "falling_tiles") {
          actives.push(spawnFallingTiles(world, add.params));
        }
      }
    }

    // Advance phaseIndex past tMs=0 phases
    phaseIndex = schedule.phases.findIndex((p) => p.tMs > 0);
    if (phaseIndex < 0) phaseIndex = schedule.phases.length;
  };

  const update = (world: World, now: number, dtMs: number) => {
    // Run continuous hazard updates
    for (const u of updaters) u(dtMs);

    const elapsedMs = now - runningStartedAt;

    // Spawn phases as time hits
    while (phaseIndex < schedule.phases.length) {
      const phase = schedule.phases[phaseIndex];
      if (elapsedMs < phase.tMs) break;

      for (const add of phase.add ?? []) {
        if (add.type === "sweeper") {
          const { instance, update } = spawnSweeper(world, add.params);
          actives.push(instance);
          updaters.push(update);
        }
        if (add.type === "falling_tiles") {
          actives.push(spawnFallingTiles(world, add.params));
        }
      }

      phaseIndex++;
    }
  };

  return { reset, update, disposeAll };
}
