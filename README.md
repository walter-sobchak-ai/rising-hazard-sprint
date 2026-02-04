# yhg-hytopia-template

Runnable starter + reusable modules for building HYTOPIA games fast.

## SDK
- Pinned: `hytopia@0.14.52` (see `docs/SDK_VERSION.md`)

## Run (dev)

**Node version:** HYTOPIA SDK is happiest on Node **22 LTS**. This repo includes `.nvmrc`.

```bash
nvm use 22  # or install it: nvm install 22
npm install
npm run typecheck
npm run dev
```

Notes:
- `npm run dev` uses the HYTOPIA CLI (`hytopia dev`).
- If your environment uses a different command, update `package.json` scripts accordingly.

## Structure
- `index.ts` → runnable entrypoint
- `examples/bootstrap/index.ts` → reference wiring
- `src/` → reusable template modules
- `assets/` → maps + UI assets (`assets/ui/index.html`)

## Next
- Replace `assets/map.json` with a real map.
- Start building game-specific modules under `src/gameplay/` or `src/systems/`.
