# Mission Control

A self-hosted, LAN-only ops dashboard designed to be pointed at **any** agent setup. Surface live data from your GitHub repos, CI workflows, Claude token usage, worker logs, and daily research reports — all in a single dark, auto-refreshing page.

## What it is

A single Node + Express process that:
- Shells out to `gh` (GitHub CLI, already authenticated) for live repo/CI data
- Reads Claude Code JSONL session files for token usage metrics
- Parses your agent's daily research reports from a configurable directory
- Exposes `/api/*` JSON endpoints
- Serves the React dashboard from `web/dist`
- Auto-refreshes every 30 s in the browser

## Panels

| Panel | Source | Reliability |
|---|---|---|
| Agent Health | `openclaw gateway status` + `~/.openclaw/openclaw.json` | Solid |
| Pull Requests | `gh pr list` (open + merged) | Solid |
| Workflows | `gh run list` | Solid |
| Achievements | `gh pr list --state merged` + `MC_REPORTS_DIR/*.md` | Solid |
| Research & Trends | `MC_REPORTS_DIR/*.md` (daily report feed) | Solid |
| GitHub Actions Cost | Billing API → estimate fallback | Best-effort |
| Subagents / Workers | `MC_WORKER_LOG_GLOB` patterns | Best-effort |
| Token Usage | `MC_CLAUDE_PROJECT_DIR/*.jsonl` | Best-effort |

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/ecimionatto/mission-control
cd mission-control
npm install

# 2. Configure for your setup
cp .env.example .env
# Edit .env — at minimum set REPOS and MC_CLAUDE_PROJECT_DIR

# 3. Build and run
npm run build       # builds web/dist then server/dist
npm start           # listens on 0.0.0.0:4317
```

Open in any browser on your LAN:

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

## Configuration

All settings are environment variables. Copy `.env.example` to `.env` to get started.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4317` | Port to listen on |
| `CACHE_TTL_MS` | `30000` | Server-side result cache TTL (ms) |
| `REPOS` | _(empty)_ | Comma-separated `owner/repo` list for PRs + workflows |
| `DASHBOARD_TOKEN` | _(unset = open)_ | Bearer token for API auth; unset = open on LAN |
| `GITHUB_TOKEN` | _(gh CLI auth)_ | GitHub PAT; only needed in non-interactive environments |
| `MC_REPORTS_DIR` | `~/clawbot/reports` | Directory containing your agent's `*.md` report files |
| `MC_CLAUDE_PROJECT_DIR` | _(required)_ | Path to your Claude Code project dir with `*.jsonl` files |
| `MC_WORKER_LOG_GLOB` | `/tmp/*-worker.log,/tmp/tf-watch.log` | Comma-separated glob patterns for worker log files |
| `MC_LOCAL_REPOS` | _(empty)_ | Comma-separated absolute paths to local git repos for AI authorship ratio |
| `GH_BILLING_OWNER` | _(derived)_ | GitHub owner for billing API; derived from `REPOS` if unset |

## For other agents

Six steps to adopt Mission Control in your own agent setup:

- **Point `REPOS`** at your agent's GitHub repos: `REPOS=myorg/api,myorg/mobile`
- **Set `MC_CLAUDE_PROJECT_DIR`** to your Claude Code project directory (`~/.claude/projects/<slug>`)
- **Set `MC_LOCAL_REPOS`** to comma-separated absolute paths of your local git repos (powers the AI authorship ratio panel)
- **Set `GH_BILLING_OWNER`** to your GitHub org/user (or leave unset — it's derived from `REPOS`)
- **Add a panel**: drop a module in `server/src/modules/` and a React component in `web/src/components/` (see CONTRIBUTING.md)
- **Framework-agnostic**: any agent that authenticates with `gh` CLI and writes markdown reports works — not just Claude Code

## Optional authentication

If `DASHBOARD_TOKEN` is set, the web app shows a password dialog that stores the token in `localStorage`. The server accepts it as:

- `Authorization: Bearer <token>` header
- `X-Dashboard-Token: <token>` header

The dashboard is **LAN-only by design** — do not expose port 4317 to the internet.

### Wiring it to your agent setup

**For another agent setup**, configure the following env vars to point at your data:

1. **`REPOS`** — the GitHub repos your agent works on:
   ```
   REPOS=myorg/api,myorg/mobile,myorg/infra
   ```

2. **`MC_CLAUDE_PROJECT_DIR`** — where Claude Code stores your session JSONL files. These live at `~/.claude/projects/<slug>/`. Find the right directory:
   ```bash
   ls ~/.claude/projects/
   ```
   Then set:
   ```
   MC_CLAUDE_PROJECT_DIR=~/.claude/projects/-home-yourname-myproject
   ```

3. **`MC_REPORTS_DIR`** — if your agent drops daily research reports as markdown files, point this at that directory. Files are parsed for source, theme, and bullet findings.

4. **`MC_WORKER_LOG_GLOB`** — if your agent writes worker/subagent logs to disk, configure the glob patterns:
   ```
   MC_WORKER_LOG_GLOB=/tmp/*-worker.log,/tmp/my-agent.log
   ```

## Firewall

Only open the port on your local network interface, never to the public internet:

```bash
# Allow only LAN subnet (adjust to match your network)
sudo ufw allow from 192.168.0.0/16 to any port 4317
sudo ufw deny 4317
```

Or simply run the server only when needed.

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

Tests cover the risky transform logic: research/achievements markdown parsing, `gh` JSON → view models, cost estimator, and token JSONL aggregator.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
