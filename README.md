# Mission Control

Private LAN-only ops dashboard. Surfaces agent health, GitHub PRs, CI workflows, Actions cost, research achievements, worker logs, and Claude token usage — all in a single dark, auto-refreshing page.

## What it is

A single Node + Express process that:
- Shells out to `gh` (already authenticated) and `openclaw` for live data
- Exposes `/api/*` JSON endpoints
- Serves the React dashboard from `web/dist`
- Auto-refreshes every 30 s in the browser

## Panels

| Panel | Source | Reliability |
|---|---|---|
| Agent Health | `openclaw gateway status` + `~/.openclaw/openclaw.json` | Solid |
| Pull Requests | `gh pr list` (open + merged) | Solid |
| Workflows | `gh run list` | Solid |
| Achievements | `gh pr list --state merged` + `~/clawbot/reports/` | Solid |
| GitHub Actions Cost | Billing API → estimate fallback | Best-effort |
| Subagents / Workers | `/tmp/*-worker.log`, `/tmp/tf-watch.log` | Best-effort |
| Token Usage | `~/.claude/projects/-home-ecimio-clawbot-workspace/*.jsonl` | Best-effort |

## How to run

```bash
# Install deps and build web
npm install
npm run build       # builds web/dist then server/dist

# Start the server
npm start           # listens on 0.0.0.0:4317
```

Access the dashboard in any browser on your LAN:

```
http://<machine-LAN-ip>:4317
```

Find your machine's LAN IP with:

```bash
ip route get 1 | grep src | awk '{print $7}'
# or
hostname -I | awk '{print $1}'
```

The server logs both addresses on startup.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4317` | Port to listen on |
| `REPOS` | `ecimionatto/daily-train-app,ecimionatto/crescendo-app` | Comma-separated `owner/repo` list |
| `DASHBOARD_TOKEN` | (unset = open) | If set, all API requests must include `Authorization: Bearer <token>` |
| `CACHE_TTL_MS` | `30000` | Server-side result cache TTL in milliseconds |

## Optional authentication

If `DASHBOARD_TOKEN` is set, the web app shows a password dialog that stores the token in `localStorage`. The server accepts it as:

- `Authorization: Bearer <token>` header
- `X-Dashboard-Token: <token>` header

The dashboard is **LAN-only by design** — do not expose port 4317 to the internet.

## Firewall note

Only open the port on your local network interface, never to the public internet:

```bash
# Allow only LAN subnet (adjust to your network)
sudo ufw allow from 192.168.0.0/16 to any port 4317
sudo ufw deny 4317
```

Or run the server only when needed and keep it off by default.

## Development

```bash
# Terminal 1 — server with hot reload
npm run dev:server

# Terminal 2 — Vite dev server (proxies /api to :4317)
npm run dev:web
```

## Tests

```bash
npm test   # runs vitest in server/
```

Tests cover the risky transform logic: achievements markdown parsing, `gh` JSON → view models, cost estimator, and token JSONL aggregator.
