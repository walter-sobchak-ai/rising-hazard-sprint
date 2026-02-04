import type { World } from "hytopia";

/**
 * Minimal in-code worldgen so we can get to "time-to-first-fun" without a map export.
 */
export function buildMvpArena(world: World): void {
  // Register a simple floor block.
  // NOTE: Block type ids must be unique per-world.
  const FLOOR_ID = 1;

  try {
    // If already registered, this will throw. We'll just ignore and continue.
    world.blockTypeRegistry.registerGenericBlockType({
      id: FLOOR_ID,
      name: "Floor",
      textureUri: "blocks/missing.png",
    });
  } catch {
    // ignore
  }

  const placements: Array<{ globalCoordinate: { x: number; y: number; z: number } }> = [];

  // Flat floor
  const half = 24;
  for (let x = -half; x <= half; x++) {
    for (let z = -half; z <= half; z++) {
      placements.push({ globalCoordinate: { x, y: 0, z } });
    }
  }

  // A few jump pillars to create verticality (so the rising hazard matters immediately)
  const pillars = [
    { x: 0, z: 0, h: 10 },
    { x: 8, z: 6, h: 8 },
    { x: -10, z: -4, h: 9 },
    { x: -4, z: 12, h: 7 },
    { x: 14, z: -10, h: 6 },
  ];

  for (const p of pillars) {
    for (let y = 1; y <= p.h; y++) {
      placements.push({ globalCoordinate: { x: p.x, y, z: p.z } });
    }
  }

  // Bulk init blocks (fast)
  world.chunkLattice.initializeBlocks({
    [FLOOR_ID]: placements.map((p) => ({ globalCoordinate: p.globalCoordinate })),
  });
}
