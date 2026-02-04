import type { GameConfig } from "../../core/config";

export type RoundPhase = "LOBBY" | "COUNTDOWN" | "RUNNING" | "RESULTS";

export type RoundTimings = {
  lobbyMs: number;
  countdownMs: number;
  runningMs: number;
  resultsMs: number;
};

export type RoundState = {
  phase: RoundPhase;
  phaseStartedAt: number;
  /** RUNNING phase start timestamp (ms), if started */
  runningStartedAt?: number;
  /** monotonically increasing round id */
  roundNumber: number;
};

export function defaultTimings(config: GameConfig): RoundTimings {
  void config;
  return {
    lobbyMs: 6_000,
    countdownMs: 3_000,
    runningMs: 90_000,
    resultsMs: 8_000,
  };
}

export function createRoundState(now: number): RoundState {
  return {
    phase: "LOBBY",
    phaseStartedAt: now,
    roundNumber: 1,
  };
}

export function getPhaseElapsedMs(state: RoundState, now: number): number {
  return Math.max(0, now - state.phaseStartedAt);
}

export function transition(state: RoundState, next: RoundPhase, now: number): RoundState {
  const s: RoundState = {
    ...state,
    phase: next,
    phaseStartedAt: now,
  };

  if (next === "RUNNING") s.runningStartedAt = now;
  return s;
}

export function nextPhaseIfDue(params: {
  state: RoundState;
  now: number;
  timings: RoundTimings;
}): RoundState {
  const { state, now, timings } = params;
  const elapsed = getPhaseElapsedMs(state, now);

  if (state.phase === "LOBBY" && elapsed >= timings.lobbyMs) return transition(state, "COUNTDOWN", now);
  if (state.phase === "COUNTDOWN" && elapsed >= timings.countdownMs) return transition(state, "RUNNING", now);
  if (state.phase === "RUNNING" && elapsed >= timings.runningMs) return transition(state, "RESULTS", now);
  if (state.phase === "RESULTS" && elapsed >= timings.resultsMs) {
    return {
      phase: "LOBBY",
      phaseStartedAt: now,
      roundNumber: state.roundNumber + 1,
    };
  }

  return state;
}
