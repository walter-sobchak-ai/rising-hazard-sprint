import {
  startServer,
  PlayerEvent,
  PlayerManagerEvent,
  EventRouter,
  Entity,
  type DefaultPlayerEntity,
  type Player,
  RigidBodyType,
} from "hytopia";

import { loadConfig } from "../../core/config";
import { gameEvents } from "../../core/events";
import { createConsoleTelemetry, bindTelemetry } from "../../systems/telemetry";
import { spawnDefaultPlayer } from "../../gameplay/player";
import { setupPlayerCamera } from "../../gameplay/camera";
import { loadOverlayUi, toast, bindUiInbound } from "../../gameplay/ui";

import { RisingHazardSprintController } from "./rising-hazard-controller";
import { buildMvpArena } from "./worldgen";
import { SPAWN_POS, SPECTATE_POS } from "./constants";

/**
 * Rising Hazard Sprint — runnable entrypoint.
 */
startServer((world) => {
  const config = loadConfig({
    debug: { logLevel: "info", showDebugOverlay: false, logEventHandlerErrors: false },
    features: { flags: { "telemetry.enabled": true } },
  });

  const telemetryClient = createConsoleTelemetry({ prefix: "rhs" });
  const telemetry = bindTelemetry({ config, client: telemetryClient, sessionId: "dev" });
  void telemetry;

  gameEvents.emitGame("game.booted", { timestamp: Date.now() });

  // In-code arena (no map export required)
  buildMvpArena(world);

  const playerEntities = new Map<string, DefaultPlayerEntity>();
  const worldPlayers = new Map<string, Player>();
  const globalEvents = EventRouter.globalInstance;

  const controller = new RisingHazardSprintController({
    config,
    worldPlayers: () => Array.from(worldPlayers.values()),
    getPlayerEntity: (playerId) => playerEntities.get(playerId),
    spawnPos: SPAWN_POS,
    spectatePos: SPECTATE_POS,
  });

  // Game controller entity (ticks every frame)
  const gameController = new Entity({
    name: "GameController",
    tag: "game.controller",
    // Block entity purely to satisfy runtime requirements; it's not meant to be seen/used.
    blockTextureUri: "blocks/missing.png",
    blockHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    rigidBodyOptions: { type: RigidBodyType.FIXED },
    controller,
  });
  gameController.spawn(world, { x: 0, y: 0, z: 0 });

  // Quick commands (HYTOPIA SDK)
  world.chatManager.registerCommand("/requeue", (player) => controller.requeuePlayer(player));
  world.chatManager.registerCommand("/panic", (player) => {
    toast(player, "Panic ramp enabled (defaults)", "info");
  });

  globalEvents.on(PlayerManagerEvent.PLAYER_CONNECTED, ({ player }) => {
    player.on(PlayerEvent.JOINED_WORLD, ({ world }) => {
      const playerId = String(player.id);
      worldPlayers.set(playerId, player);

      // Load persisted profile (if available)
      const data = player.getPersistedData();
      const tokens = typeof data?.rhs_tokens === "number" ? (data.rhs_tokens as number) : 0;
      const bestSurvivalMs =
        typeof data?.rhs_bestSurvivalMs === "number" ? (data.rhs_bestSurvivalMs as number) : 0;
      // Seed controller cache (so HUD shows immediately)
      controller.seedProfile(playerId, { tokens, bestSurvivalMs });

      // UI
      loadOverlayUi(player);
      bindUiInbound({
        world,
        player,
        config,
        onMessage: (msg) => {
          if (msg.type === "ui.ready") toast(player, "UI ready", "success");
          if (msg.type === "ui.action" && msg.action === "requeue") {
            controller.requeuePlayer(player);
          }
        },
      });

      // Spawn
      const entity = spawnDefaultPlayer({
        world,
        player,
        config,
        spawnOptions: {
          name: "Runner",
          spawn: SPAWN_POS,
        },
      });

      playerEntities.set(playerId, entity);
      setupPlayerCamera({ config, player, playerEntity: entity });

      toast(player, "Rising Hazard Sprint", "info");
    });

    player.on(PlayerEvent.LEFT_WORLD, () => {
      const playerId = String(player.id);
      worldPlayers.delete(playerId);
      playerEntities.get(playerId)?.despawn();
      playerEntities.delete(playerId);
    });
  });
});
