import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { shell } from '../utils/shell';
import { makeOk, makeErr, AgentHealthData, Result } from '../types';

const CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json');

interface OpenclawConfig {
  agents?: { defaults?: { model?: { primary?: string; fallbacks?: string[] } } };
  gateway?: { port?: number };
}

async function readConfig(): Promise<{ model: string; fallbacks: string[]; port: number }> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw) as OpenclawConfig;
    return {
      model: cfg?.agents?.defaults?.model?.primary ?? 'unknown',
      fallbacks: cfg?.agents?.defaults?.model?.fallbacks ?? [],
      port: cfg?.gateway?.port ?? 18789,
    };
  } catch {
    return { model: 'unknown', fallbacks: [], port: 18789 };
  }
}

export async function fetchAgentHealth(): Promise<Result<AgentHealthData>> {
  const config = await readConfig();
  const { model, fallbacks, port } = config;

  const statusResult = await shell('openclaw', ['gateway', 'status'], 8_000);

  if (!statusResult.ok) {
    // Fallback: check if port is listening
    const nc = await shell('nc', ['-z', '-w', '2', '127.0.0.1', String(port)], 4_000);
    return makeOk({
      gatewayStatus: nc.ok ? 'up' : 'unknown',
      model,
      fallbacks,
      port,
    });
  }

  const raw = statusResult.stdout;

  // Parse "Runtime: stopped" / "Runtime: running" lines
  const runtimeMatch = raw.match(/^Runtime:\s*(\S+)/m);
  const runtimeState = runtimeMatch?.[1]?.toLowerCase() ?? '';
  const isRunning = runtimeState.startsWith('running') || runtimeState.startsWith('active');
  const isStopped = runtimeState.startsWith('stopped') || runtimeState.startsWith('inactive');

  // "Connectivity probe: ok" means the port is reachable even if the service is stopped
  const probeMatch = raw.match(/^Connectivity probe:\s*(.+)/m);
  const probeStatus = probeMatch?.[1]?.trim() ?? '';
  const probeOk = /^ok/i.test(probeStatus);

  // "Listening: addr:port" confirms the port is bound
  const listeningMatch = raw.match(/^Listening:\s*(.+)/m);
  const listening = listeningMatch?.[1]?.trim();

  // Gateway is "up" if something is listening/responding on the port
  const gatewayStatus = isRunning || probeOk || listening
    ? 'up'
    : isStopped
    ? 'down'
    : 'unknown';

  const uptimeMatch = raw.match(/uptime[:\s]+([^\n]+)/i);

  return makeOk({
    gatewayStatus,
    uptime: uptimeMatch?.[1]?.trim(),
    model,
    fallbacks,
    port,
    connectivityProbe: probeStatus || undefined,
    rawStatus: raw.slice(0, 600),
  });
}
