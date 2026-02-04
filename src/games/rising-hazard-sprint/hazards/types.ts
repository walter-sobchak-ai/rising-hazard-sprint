import type { World } from "hytopia";

export type HazardKind = "rising_kill_height" | "sweeper" | "falling_tiles";

export type HazardInstance = {
  kind: HazardKind;
  /** Despawn/cleanup resources. */
  dispose: () => void;
};

export type HazardContext = {
  world: World;
  spawnPos: { x: number; y: number; z: number };
  spectatePos: { x: number; y: number; z: number };
};
