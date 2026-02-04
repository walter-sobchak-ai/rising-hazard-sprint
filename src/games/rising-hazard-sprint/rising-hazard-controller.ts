import {
  BaseEntityController,
  type Entity,
  type Player,
  type DefaultPlayerEntity,
} from "hytopia";

import type { GameConfig } from "../../core/config";
import { setHudText, toast } from "../../gameplay/ui";

import { DEFAULT_SCHEDULE, type HazardSchedule } from "./hazardSchedule";
import { createHazardDirector } from "./hazards/director";
import {
  createRoundState,
  defaultTimings,
  nextPhaseIfDue,
  type RoundState,
  type RoundTimings,
} from "./round";

type PlayerId = string;

type RuntimeProfile = {
  tokens: number;
  bestSurvivalMs: number;
};

type WeeklyRuntime = {
  weekKey: string;
  playCount: number;
  surviveBestSec: number;
  finishedOnce: boolean;
};

export class RisingHazardSprintController extends BaseEntityController {
  private config: GameConfig;
  private schedule: HazardSchedule;
  private timings: RoundTimings;

  private state: RoundState;

  private worldPlayers: () => Player[];
  private getPlayerEntity: (playerId: PlayerId) => DefaultPlayerEntity | undefined;

  private eliminated = new Set<PlayerId>();
  private eliminatedAtMs = new Map<PlayerId, number>();
  private profiles = new Map<PlayerId, RuntimeProfile>();
  private weekly = new Map<PlayerId, WeeklyRuntime>();

  private spawnPos: { x: number; y: number; z: number };
  private spectatePos: { x: number; y: number; z: number };

  // Hazard runtime
  private killHeightStart = -5;
  private killHeightRiseRate = 0.08;
  private hazardDirector = createHazardDirector({ schedule: DEFAULT_SCHEDULE });

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
    this.hazardDirector = createHazardDirector({ schedule: this.schedule });
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
    // Keep reference to the world via the entity once spawned.
    // (We avoid storing world directly until spawn.)
    void entity;
  }

  override tick(entity: Entity, deltaTimeMs: number): void {
    super.tick(entity, deltaTimeMs);

    const now = Date.now();

    const prevPhase = this.state.phase;
    this.state = nextPhaseIfDue({ state: this.state, now, timings: this.timings });

    if (this.state.phase !== prevPhase) {
      this.onPhaseChanged(prevPhase, this.state.phase, now, entity);
    }

    // Only apply hazards during RUNNING.
    if (this.state.phase === "RUNNING") {
      this.applyRisingKillHeight(now);
      if (entity.world) this.hazardDirector.update(entity.world, now, deltaTimeMs);

      // If everyone is dead, end early.
      const alive = this.worldPlayers()
        .map((p) => String(p.id))
        .filter((id) => !this.eliminated.has(id)).length;
      if (alive <= 0 && this.worldPlayers().length > 0) {
        this.state = { ...this.state, phase: "RESULTS", phaseStartedAt: now };
        this.onPhaseChanged("RUNNING", "RESULTS", now, entity);
      }
    }

    this.renderHud(now);
  }

  private onPhaseChanged(
    from: RoundState["phase"],
    to: RoundState["phase"],
    now: number,
    controllerEntity: Entity
  ) {
    // Optional hook point for analytics/live-ops later.
    void from;

    if (to === "RUNNING") {
      this.eliminated.clear();
      this.eliminatedAtMs.clear();

      // (Re)spawn hazards for this round.
      this.hazardDirector.reset(controllerEntity.world!, now);

      this.broadcastToast(`Round ${this.state.roundNumber} — GO!`, "success");
    }

    if (to === "RESULTS") {
      // Cleanup round hazards.
      this.hazardDirector.disposeAll();

      const runningStartedAt = this.state.runningStartedAt ?? now;
      const roundEndAt = now;

      // Award tokens + update best survival + weekly progress
      for (const p of this.worldPlayers()) {
        const id = String(p.id);
        const eliminatedAt = this.eliminatedAtMs.get(id) ?? roundEndAt;
        const survivalMs = Math.max(0, eliminatedAt - runningStartedAt);
        const survivalSec = Math.floor(survivalMs / 1000);

        const prof = this.profiles.get(id) ?? { tokens: 0, bestSurvivalMs: 0 };
        const tokensEarned = this.calcTokens(survivalMs);
        const best = Math.max(prof.bestSurvivalMs, survivalMs);

        const next = { tokens: prof.tokens + tokensEarned, bestSurvivalMs: best };
        this.profiles.set(id, next);

        const wk = this.weekly.get(id);
        const nextWeekly: WeeklyRuntime | undefined = wk
          ? {
              ...wk,
              playCount: wk.playCount + 1,
              surviveBestSec: Math.max(wk.surviveBestSec, survivalSec),
              finishedOnce: wk.finishedOnce || survivalSec >= 10,
            }
          : undefined;

        if (nextWeekly) this.weekly.set(id, nextWeekly);

        // Persist (shallow merge)
        p.setPersistedData({
          rhs_tokens: next.tokens,
          rhs_bestSurvivalMs: next.bestSurvivalMs,
          ...(nextWeekly
            ? {
                rhs_weekKey: nextWeekly.weekKey,
                rhs_week_playCount: nextWeekly.playCount,
                rhs_week_surviveBest: nextWeekly.surviveBestSec,
                rhs_week_finishedOnce: nextWeekly.finishedOnce,
              }
            : {}),
        });

        toast(p, `+${tokensEarned} tokens (survived ${survivalSec}s)`, "success");
      }

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

  seedProfile(playerId: string, profile: RuntimeProfile): void {
    this.profiles.set(playerId, profile);
  }

  seedWeekly(playerId: string, weekly: WeeklyRuntime): void {
    this.weekly.set(playerId, weekly);
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
    this.eliminatedAtMs.set(playerId, Date.now());

    // Simple spectate: teleport to a safe platform in the sky.
    ent.setLinearVelocity({ x: 0, y: 0, z: 0 });
    ent.setAngularVelocity({ x: 0, y: 0, z: 0 });
    ent.setPosition(this.spectatePos);

    toast(player, "ELIMINATED — click Requeue", "error");
  }

  private calcTokens(survivalMs: number): number {
    // Simple, addictive progression: you always get something, but living longer matters.
    const s = Math.max(0, survivalMs) / 1000;
    return Math.max(1, Math.floor(1 + s / 10));
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

      const prof = this.profiles.get(playerId) ?? { tokens: 0, bestSurvivalMs: 0 };
      setHudText(
        player,
        "topRight",
        `Tokens: ${prof.tokens}\nBest: ${(prof.bestSurvivalMs / 1000).toFixed(0)}s`
      );

      const wk = this.weekly.get(playerId);
      if (wk) {
        setHudText(
          player,
          "bottomRight",
          `WEEKLY (${wk.weekKey})\n• Play: ${wk.playCount}/20\n• Best survive: ${wk.surviveBestSec}s/60s\n• Finish once: ${wk.finishedOnce ? "✓" : "–"}`
        );
      } else {
        setHudText(player, "bottomRight", "");
      }

      if (phase === "RUNNING") {
        const runningStartedAt = this.state.runningStartedAt ?? now;
        const elapsedSec = Math.max(0, now - runningStartedAt) / 1000;
        const killY = this.killHeightStart + this.killHeightRiseRate * elapsedSec;
        const hazardLevel = this.hazardDirector.getPhaseIndex() + 1;
        setHudText(
          player,
          "bottomLeft",
          `Hazard Lv ${hazardLevel}\nKill height: ${killY.toFixed(1)}`
        );
      } else {
        setHudText(player, "bottomLeft", "");
      }
    }
  }

  private broadcastToast(message: string, level: "info" | "success" | "error") {
    for (const p of this.worldPlayers()) toast(p, message, level);
  }
}
