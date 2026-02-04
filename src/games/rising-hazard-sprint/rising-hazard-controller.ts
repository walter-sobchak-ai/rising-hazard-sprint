import {
  BaseEntityController,
  type Entity,
  type Player,
  type DefaultPlayerEntity,
} from "hytopia";

import type { GameConfig } from "../../core/config";
import { setHudText, toast } from "../../gameplay/ui";

import { DEFAULT_SCHEDULE, type HazardSchedule } from "./hazardSchedule";
import {
  createRoundState,
  defaultTimings,
  nextPhaseIfDue,
  type RoundState,
  type RoundTimings,
} from "./round";

type PlayerId = string;

export class RisingHazardSprintController extends BaseEntityController {
  private config: GameConfig;
  private schedule: HazardSchedule;
  private timings: RoundTimings;

  private state: RoundState;

  private worldPlayers: () => Player[];
  private getPlayerEntity: (playerId: PlayerId) => DefaultPlayerEntity | undefined;

  private eliminated = new Set<PlayerId>();
  private spawnPos: { x: number; y: number; z: number };
  private spectatePos: { x: number; y: number; z: number };

  // Hazard runtime (v1)
  private killHeightStart = -5;
  private killHeightRiseRate = 0.08;

  constructor(params: {
    config: GameConfig;
    schedule?: HazardSchedule;
    worldPlayers: () => Player[];
    getPlayerEntity: (playerId: PlayerId) => DefaultPlayerEntity | undefined;
    spawnPos: { x: number; y: number; z: number };
    spectatePos: { x: number; y: number; z: number };
    now?: () => number;
  }) {
    super();
    this.config = params.config;
    this.schedule = params.schedule ?? DEFAULT_SCHEDULE;
    this.timings = defaultTimings(params.config);

    const now = params.now?.() ?? Date.now();
    this.state = createRoundState(now);

    this.worldPlayers = params.worldPlayers;
    this.getPlayerEntity = params.getPlayerEntity;
    this.spawnPos = params.spawnPos;
    this.spectatePos = params.spectatePos;

    // Prime hazards based on schedule (v1: single rising kill-height)
    const first = this.schedule.phases
      .filter((p) => p.tMs === 0)
      .flatMap((p) => p.add ?? [])
      .find((a) => a.type === "rising_kill_height");

    if (first?.type === "rising_kill_height") {
      this.killHeightStart = first.params.startHeight;
      this.killHeightRiseRate = first.params.riseRate;
    }
  }

  override spawn(entity: Entity): void {
    super.spawn(entity);
    // v1: keep template event surface minimal.
  }

  override tick(entity: Entity, deltaTimeMs: number): void {
    super.tick(entity, deltaTimeMs);

    const now = Date.now();

    const prevPhase = this.state.phase;
    this.state = nextPhaseIfDue({ state: this.state, now, timings: this.timings });

    if (this.state.phase !== prevPhase) {
      this.onPhaseChanged(prevPhase, this.state.phase, now);
    }

    // Only apply hazards during RUNNING.
    if (this.state.phase === "RUNNING") {
      this.applyRisingKillHeight(now);

      // If everyone is dead, end early.
      const alive = this.worldPlayers()
        .map((p) => String(p.id))
        .filter((id) => !this.eliminated.has(id)).length;
      if (alive <= 0 && this.worldPlayers().length > 0) {
        this.state = { ...this.state, phase: "RESULTS", phaseStartedAt: now };
        this.onPhaseChanged("RUNNING", "RESULTS", now);
      }
    }

    this.renderHud(now);
  }

  private onPhaseChanged(from: RoundState["phase"], to: RoundState["phase"], now: number) {
    // Optional hook point for analytics/live-ops later.
    void from;
    void now;

    if (to === "RUNNING") {
      this.eliminated.clear();
      this.broadcastToast(`Round ${this.state.roundNumber} — GO!`, "success");
    }

    if (to === "RESULTS") {
      const survivors = this.worldPlayers()
        .map((p) => String(p.id))
        .filter((id) => !this.eliminated.has(id)).length;
      this.broadcastToast(`Round over — survivors: ${survivors}`, "info");
    }
  }

  private applyRisingKillHeight(now: number) {
    const runningStartedAt = this.state.runningStartedAt ?? now;
    const elapsedSec = Math.max(0, now - runningStartedAt) / 1000;
    const killY = this.killHeightStart + this.killHeightRiseRate * elapsedSec;

    for (const player of this.worldPlayers()) {
      const playerId = String(player.id);
      if (this.eliminated.has(playerId)) continue;

      const ent = this.getPlayerEntity(playerId);
      if (!ent) continue;

      const pos = ent.position;
      if (pos.y < killY) {
        this.eliminatePlayer(player, ent);
      }
    }
  }

  /** Called by UI or chat to requeue a player back into the current round. */
  requeuePlayer(player: Player): void {
    const playerId = String(player.id);
    this.eliminated.delete(playerId);

    const ent = this.getPlayerEntity(playerId);
    if (ent) {
      ent.setLinearVelocity({ x: 0, y: 0, z: 0 });
      ent.setAngularVelocity({ x: 0, y: 0, z: 0 });
      ent.setPosition(this.spawnPos);
    }

    toast(player, "Requeued", "success");
  }

  private eliminatePlayer(player: Player, ent: DefaultPlayerEntity): void {
    const playerId = String(player.id);
    if (this.eliminated.has(playerId)) return;

    this.eliminated.add(playerId);

    // Simple spectate: teleport to a safe platform in the sky.
    ent.setLinearVelocity({ x: 0, y: 0, z: 0 });
    ent.setAngularVelocity({ x: 0, y: 0, z: 0 });
    ent.setPosition(this.spectatePos);

    toast(player, "ELIMINATED — click Requeue", "error");
  }

  private renderHud(now: number) {
    const phase = this.state.phase;

    const phaseElapsed = Math.max(0, now - this.state.phaseStartedAt);
    const phaseTotal =
      phase === "LOBBY"
        ? this.timings.lobbyMs
        : phase === "COUNTDOWN"
          ? this.timings.countdownMs
          : phase === "RUNNING"
            ? this.timings.runningMs
            : this.timings.resultsMs;

    const remainingMs = Math.max(0, phaseTotal - phaseElapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);

    for (const player of this.worldPlayers()) {
      const playerId = String(player.id);
      const elim = this.eliminated.has(playerId);

      setHudText(
        player,
        "topLeft",
        `Round ${this.state.roundNumber}\n${phase} (${remainingSec}s)${elim ? "\nELIMINATED" : ""}`
      );

      if (phase === "RUNNING") {
        const runningStartedAt = this.state.runningStartedAt ?? now;
        const elapsedSec = Math.max(0, now - runningStartedAt) / 1000;
        const killY = this.killHeightStart + this.killHeightRiseRate * elapsedSec;
        setHudText(player, "bottomLeft", `Kill height: ${killY.toFixed(1)}`);
      } else {
        setHudText(player, "bottomLeft", "");
      }
    }
  }

  private broadcastToast(message: string, level: "info" | "success" | "error") {
    for (const p of this.worldPlayers()) toast(p, message, level);
  }
}
