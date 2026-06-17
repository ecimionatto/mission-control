import express from 'express';
import path from 'path';
import { fetchAgentHealth } from './modules/agentHealth';
import { fetchPRs } from './modules/githubPRs';
import { fetchWorkflows } from './modules/githubWorkflows';
import { fetchCost } from './modules/githubCost';
import { fetchAchievements } from './modules/achievements';
import { fetchSubagents } from './modules/subagents';
import { fetchTokenUsage } from './modules/tokenUsage';
import { fetchResearch } from './modules/research';
import { fetchAiRatio } from './modules/aiRatio';
import { fetchFleetTracing } from './modules/fleetTracing';

const PORT = parseInt(process.env.PORT ?? '4317', 10);
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN;
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS ?? '30000', 10);

// Simple in-memory result cache
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function withCache<T>(key: string, fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.data as T;
    const data = await fn();
    cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  };
}

const modules = {
  agentHealth: withCache('agentHealth', fetchAgentHealth),
  prs: withCache('prs', fetchPRs),
  workflows: withCache('workflows', fetchWorkflows),
  cost: withCache('cost', fetchCost),
  achievements: withCache('achievements', fetchAchievements),
  subagents: withCache('subagents', fetchSubagents),
  tokenUsage: withCache('tokenUsage', fetchTokenUsage),
  research: withCache('research', fetchResearch),
  aiRatio: withCache('aiRatio', fetchAiRatio),
  fleetTracing: withCache('fleetTracing', fetchFleetTracing),
};

const app = express();

// Optional bearer-token auth
if (DASHBOARD_TOKEN) {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) { next(); return; }
    const auth = req.headers['authorization'];
    const tokenHeader = req.headers['x-dashboard-token'] as string | undefined;
    if (auth === `Bearer ${DASHBOARD_TOKEN}` || tokenHeader === DASHBOARD_TOKEN) {
      next(); return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  });
}

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, X-Dashboard-Token, Content-Type');
  next();
});

// Aggregate endpoint — single round-trip for the dashboard
app.get('/api/all', async (_req, res) => {
  const [agentHealth, prs, workflows, cost, achievements, subagents, tokenUsage, research, aiRatio, fleetTracing] =
    await Promise.all([
      modules.agentHealth(),
      modules.prs(),
      modules.workflows(),
      modules.cost(),
      modules.achievements(),
      modules.subagents(),
      modules.tokenUsage(),
      modules.research(),
      modules.aiRatio(),
      modules.fleetTracing(),
    ]);
  res.json({ agentHealth, prs, workflows, cost, achievements, subagents, tokenUsage, research, aiRatio, fleetTracing });
});

app.get('/api/agent-health', async (_req, res) => res.json(await modules.agentHealth()));
app.get('/api/prs', async (_req, res) => res.json(await modules.prs()));
app.get('/api/workflows', async (_req, res) => res.json(await modules.workflows()));
app.get('/api/cost', async (_req, res) => res.json(await modules.cost()));
app.get('/api/achievements', async (_req, res) => res.json(await modules.achievements()));
app.get('/api/subagents', async (_req, res) => res.json(await modules.subagents()));
app.get('/api/token-usage', async (_req, res) => res.json(await modules.tokenUsage()));
app.get('/api/research', async (_req, res) => res.json(await modules.research()));
app.get('/api/ai-ratio', async (_req, res) => res.json(await modules.aiRatio()));
app.get('/api/fleet-tracing', async (_req, res) => res.json(await modules.fleetTracing()));

// Serve web app in production
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(WEB_DIST));
app.get('*', (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nMission Control  →  http://0.0.0.0:${PORT}`);
  const lan = getLanIp();
  if (lan) console.log(`LAN access       →  http://${lan}:${PORT}`);
  console.log(`Token auth       →  ${DASHBOARD_TOKEN ? 'ENABLED' : 'disabled (open)'}`);
  console.log(`Cache TTL        →  ${CACHE_TTL_MS / 1000}s\n`);
});

function getLanIp(): string | null {
  try {
    const { networkInterfaces } = require('os') as typeof import('os');
    for (const ifaces of Object.values(networkInterfaces())) {
      for (const iface of ifaces ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
  } catch { /* ignore */ }
  return null;
}
