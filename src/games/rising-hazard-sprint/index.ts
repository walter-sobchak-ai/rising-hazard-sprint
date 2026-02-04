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

  const playerEntities = new Map<string, DefaultPlayerEntity>();
  const worldPlayers = new Map<string, Player>();
  const globalEvents = EventRouter.globalInstance;

  // Game controller entity (ticks every frame)
  const gameController = new Entity({
    name: "GameController",
    tag: "game.controller",
    // Block entity purely to satisfy runtime requirements; it's not meant to be seen/used.
    blockTextureUri: "blocks/missing.png",
    blockHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    rigidBodyOptions: { type: RigidBodyType.FIXED },
    controller: new RisingHazardSprintController({
      config,
      worldPlayers: () => Array.from(worldPlayers.values()),
      getPlayerEntity: (playerId) => playerEntities.get(playerId),
    }),
  });
  gameController.spawn(world, { x: 0, y: 0, z: 0 });

  globalEvents.on(PlayerManagerEvent.PLAYER_CONNECTED, ({ player }) => {
    player.on(PlayerEvent.JOINED_WORLD, ({ world }) => {
      const playerId = String(player.id);
      worldPlayers.set(playerId, player);

      // UI
      loadOverlayUi(player);
      bindUiInbound({
        world,
        player,
        config,
        onMessage: (msg) => {
          if (msg.type === "ui.ready") toast(player, "UI ready", "success");
        },
      });

      // Spawn
      const entity = spawnDefaultPlayer({
        world,
        player,
        config,
        spawnOptions: {
          name: "Runner",
          spawn: { x: 0, y: 10, z: 0 },
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
