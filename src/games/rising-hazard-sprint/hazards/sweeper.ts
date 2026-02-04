import { Entity, EntityEvent, RigidBodyType } from "hytopia";
import type { World, Entity as HEntity } from "hytopia";

import type { HazardInstance } from "./types";

type SweeperParams = {
  center: { x: number; y: number; z: number };
  /** total arm length (full), not half */
  length: number;
  thickness: number;
  y: number;
  /** radians per second (base) */
  angularSpeed: number;
  /** optional radians/sec^2 */
  angularAccel?: number;
  /** optional clamp */
  angularSpeedMax?: number;
  /** impulse strength applied to players on hit */
  knockback: number;
  lift: number;
  /** per-target hit cooldown (ms) */
  hitCooldownMs?: number;
};

function yawQuat(yawRad: number) {
  const half = yawRad / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function normalize(v: { x: number; y: number; z: number }) {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

export function spawnSweeper(world: World, params: SweeperParams): {
  instance: HazardInstance;
  update: (dtMs: number) => void;
} {
  const armHalf = params.length / 2;

  const sweeper = new Entity({
    name: "Sweeper",
    tag: "hazard.sweeper",
    blockTextureUri: "blocks/missing.png",
    // Long thin bar
    blockHalfExtents: { x: armHalf, y: params.thickness / 2, z: params.thickness / 2 },
    rigidBodyOptions: { type: RigidBodyType.KINEMATIC_POSITION },
  });

  sweeper.spawn(world, { x: params.center.x, y: params.y, z: params.center.z });

  // Collision → knockback (with cooldown)
  const lastHitAt = new Map<number, number>();
  const hitCooldownMs = params.hitCooldownMs ?? 400;

  sweeper.on(EntityEvent.ENTITY_COLLISION, ({ otherEntity, started }) => {
    if (!started) return;

    const playerEnt = otherEntity as unknown as HEntity;
    if (playerEnt.tag === "game.controller") return;

    const entId = playerEnt.id;
    if (typeof entId !== "number") return;

    const now = Date.now();
    const last = lastHitAt.get(entId) ?? 0;
    if (now - last < hitCooldownMs) return;
    lastHitAt.set(entId, now);

    const fromCenter = {
      x: playerEnt.position.x - params.center.x,
      y: 0,
      z: playerEnt.position.z - params.center.z,
    };
    const dir = normalize(fromCenter);

    try {
      playerEnt.applyImpulse({
        x: dir.x * params.knockback,
        y: params.lift,
        z: dir.z * params.knockback,
      });
    } catch {
      // ignore
    }
  });

  let yaw = 0;
  let t = 0;

  const update = (dtMs: number) => {
    const dt = dtMs / 1000;
    t += dt;

    const speed = (() => {
      const base = params.angularSpeed;
      const accel = params.angularAccel ?? 0;
      const s = base + accel * t;
      const max = params.angularSpeedMax;
      return typeof max === "number" ? Math.min(max, s) : s;
    })();

    yaw += speed * dt;

    // Keep centered, rotate around Y
    sweeper.setNextKinematicPosition({ x: params.center.x, y: params.y, z: params.center.z });
    sweeper.setNextKinematicRotation(yawQuat(yaw));
  };

  const instance: HazardInstance = {
    kind: "sweeper",
    dispose: () => {
      sweeper.despawn();
    },
  };

  return { instance, update };
}
