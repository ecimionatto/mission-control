# Contributing

Thanks for your interest in Mission Control!

## Getting started

```bash
npm install
npm test          # server-side vitest suite
npm run build     # type-check + build both packages
```

## Development

```bash
# Terminal 1 — server with hot reload
npm run dev:server

# Terminal 2 — Vite dev server (proxies /api to :4317)
npm run dev:web
```

## Adding a new panel

1. Add a module under `server/src/modules/` that exports `fetchXxx(): Promise<Result<XxxData>>`.
   Use `makeOk(data)` / `makeErr(message)` from `types.ts`.
2. Register it in `server/src/index.ts` (cache + route + include in `/api/all`).
3. Add the data types to both `server/src/types.ts` and `web/src/api.ts`.
4. Create `web/src/components/XxxPanel.tsx` and add it to `web/src/App.tsx`.
5. Write tests for any transform logic in `server/src/__tests__/`.

## Tests

Tests live in `server/src/__tests__/`. Run with:

```bash
npm test
```

Cover pure-function transforms — avoid testing shell calls or filesystem operations directly.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`

## Pull requests

Open a PR against `main`. Include a short description and a test plan.

## External adapters welcome

Panels and adapters for other agent frameworks (OpenClaw, Codex, Amp, and others) are especially welcome. If your agent produces data in a format this dashboard can surface, open a PR with a new module + panel pair.
