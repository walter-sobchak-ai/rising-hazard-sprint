import { Entity, EntityEvent, RigidBodyType } from "hytopia";
import type { World } from "hytopia";

import type { HazardInstance } from "./types";

export type FallingTilesParams = {
  origin: { x: number; y: number; z: number };
  width: number;
  depth: number;
  tileSize: number;
  gap: number;
  /** baseline ms after trigger before tile despawns */
  dropDelayMs: number;
  /** random betrayal: every N ms, arm a few random tiles to drop even without stepping */
  betrayalEveryMs?: number;
  betrayalCount?: number;
  /** +/- jitter added to any trigger delay */
  delayJitterMs?: number;
};

export function spawnFallingTiles(world: World, params: FallingTilesParams): HazardInstance {
  const tiles: Entity[] = [];
  const aliveTiles: Entity[] = [];
  const pending = new Set<Entity>();
  const timeouts: NodeJS.Timeout[] = [];
  const intervals: NodeJS.Timeout[] = [];

  const halfW = Math.floor(params.width / 2);
  const halfD = Math.floor(params.depth / 2);

  const triggerDrop = (t: Entity, reason: "step" | "betrayal") => {
    if (pending.has(t)) return;
    pending.add(t);

    const jitter = params.delayJitterMs ?? 0;
    const delay = Math.max(
      50,
      params.dropDelayMs + (jitter ? Math.floor((Math.random() * 2 - 1) * jitter) : 0)
    );

    const to = setTimeout(() => {
      try {
        // Remove from alive list
        const idx = aliveTiles.indexOf(t);
        if (idx >= 0) aliveTiles.splice(idx, 1);

        t.despawn();
      } catch {
        // ignore
      }
    }, delay);
    timeouts.push(to);

    void reason;
  };

  const spawnTile = (x: number, z: number) => {
    const t = new Entity({
      name: "Tile",
      tag: "hazard.fallingTile",
      blockTextureUri: "blocks/missing.png",
      blockHalfExtents: { x: params.tileSize / 2, y: 0.5, z: params.tileSize / 2 },
      rigidBodyOptions: { type: RigidBodyType.FIXED },
    });

    t.spawn(world, { x, y: params.origin.y, z });

    t.on(EntityEvent.ENTITY_COLLISION, ({ started }) => {
      if (!started) return;
      triggerDrop(t, "step");
    });

    tiles.push(t);
    aliveTiles.push(t);
  };

  for (let ix = -halfW; ix <= halfW; ix++) {
    for (let iz = -halfD; iz <= halfD; iz++) {
      const x = params.origin.x + ix * (params.tileSize + params.gap);
      const z = params.origin.z + iz * (params.tileSize + params.gap);
      spawnTile(x, z);
    }
  }

  // Random betrayal: periodically arm random tiles to drop.
  const betrayalEveryMs = params.betrayalEveryMs ?? 0;
  const betrayalCount = params.betrayalCount ?? 0;

  if (betrayalEveryMs > 0 && betrayalCount > 0) {
    const iv = setInterval(() => {
      if (aliveTiles.length === 0) return;

      for (let i = 0; i < betrayalCount; i++) {
        if (aliveTiles.length === 0) break;
        const idx = Math.floor(Math.random() * aliveTiles.length);
        const t = aliveTiles[idx];
        triggerDrop(t, "betrayal");
      }
    }, betrayalEveryMs);

    intervals.push(iv);
  }

  return {
    kind: "falling_tiles",
    dispose: () => {
      for (const iv of intervals) clearInterval(iv);
      for (const to of timeouts) clearTimeout(to);
      for (const t of tiles) {
        try {
          t.despawn();
        } catch {
          // ignore
        }
      }
    },
  };
}
