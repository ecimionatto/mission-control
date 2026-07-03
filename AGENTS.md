# AGENTS.md

Machine-readable adoption guide for autonomous coding agents (Claude Code, OpenClaw, Codex, etc.).

## Quick setup

Set these environment variables, then run:

```sh
npm install
npm run build
npm start      # listens on 0.0.0.0:4317
```

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `REPOS` | yes | `myorg/api,myorg/mobile` | GitHub repos to track (PRs, CI, cost) |
| `MC_CLAUDE_PROJECT_DIR` | yes | `~/.claude/projects/-home-user-myproject` | Claude Code JSONL session files |
| `MC_LOCAL_REPOS` | no | `/home/user/repo1,/home/user/repo2` | Local git repos for AI authorship ratio |
| `GH_BILLING_OWNER` | no | `myorg` | GitHub owner for billing API (derived from REPOS if unset) |
| `MC_REPORTS_DIR` | no | `~/clawbot/reports` | Directory of agent markdown research reports |
| `MC_WORKER_LOG_GLOB` | no | `/tmp/*-worker.log` | Glob patterns for worker/subagent log files |
| `DASHBOARD_TOKEN` | no | `secret` | Bearer token for API auth; unset = open on LAN |
| `PORT` | no | `4317` | Port to listen on |

## Extending

To add a new panel:

1. Create `server/src/modules/myPanel.ts` — export `fetchMyPanel(): Promise<Result<MyPanelData>>`. Use `makeOk(data)` / `makeErr(message)` from `../types`.
2. Register in `server/src/index.ts`: add to the `modules` map, add a route, and include in `/api/all`.
3. Add types to `server/src/types.ts` AND `web/src/api.ts` (kept in sync manually).
4. Create `web/src/components/MyPanel.tsx` and add it to `web/src/App.tsx`.
5. Write tests for transform logic in `server/src/__tests__/myPanel.test.ts`.

## Contributing

PRs welcome — especially adapters for other agent frameworks (OpenClaw, Codex, Amp, etc.), new data panels, and improvements to the AI authorship ratio heuristic. See CONTRIBUTING.md.
