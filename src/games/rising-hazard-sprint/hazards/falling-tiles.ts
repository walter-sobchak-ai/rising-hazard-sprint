import { Entity, EntityEvent, RigidBodyType } from "hytopia";
import type { World } from "hytopia";

import type { HazardInstance } from "./types";

export type FallingTilesParams = {
  origin: { x: number; y: number; z: number };
  width: number;
  depth: number;
  tileSize: number;
  gap: number;
  /** ms after first step before tile despawns */
  dropDelayMs: number;
};

export function spawnFallingTiles(world: World, params: FallingTilesParams): HazardInstance {
  const tiles: Entity[] = [];
  const pending = new Set<Entity>();
  const timeouts: NodeJS.Timeout[] = [];

  const halfW = Math.floor(params.width / 2);
  const halfD = Math.floor(params.depth / 2);

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
      if (pending.has(t)) return;

      pending.add(t);
      const to = setTimeout(() => {
        try {
          t.despawn();
        } catch {
          // ignore
        }
      }, params.dropDelayMs);
      timeouts.push(to);
    });

    tiles.push(t);
  };

  for (let ix = -halfW; ix <= halfW; ix++) {
    for (let iz = -halfD; iz <= halfD; iz++) {
      const x = params.origin.x + ix * (params.tileSize + params.gap);
      const z = params.origin.z + iz * (params.tileSize + params.gap);
      spawnTile(x, z);
    }
  }

  return {
    kind: "falling_tiles",
    dispose: () => {
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
