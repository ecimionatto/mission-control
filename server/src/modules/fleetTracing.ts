import { readFile, stat } from 'fs/promises';
import { makeOk, FleetTracingData, TracedWorker, WorkerStatus, Result } from '../types';
import { getLogPaths } from './subagents';

export const STALE_MS = 15 * 60 * 1_000;

export interface StuckResult {
  status: WorkerStatus;
  retryCount: number;
  reason: string;
}

export function detectStuck(lastLines: string[], modifiedAt: string, nowMs: number): StuckResult {
  const counts = new Map<string, number>();
  for (const line of lastLines) {
    const key = line.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const retryCount = counts.size === 0 ? 0 : Math.max(...counts.values());

  if (retryCount > 3) {
    return { status: 'stuck', retryCount, reason: `comb-pattern: same line repeated ${retryCount}x` };
  }

  const ageMsec = nowMs - new Date(modifiedAt).getTime();
  if (ageMsec > STALE_MS) {
    return { status: 'idle', retryCount, reason: `log not updated for ${Math.round(ageMsec / 60_000)} min` };
  }

  return { status: 'active', retryCount, reason: 'log recently updated with varied output' };
}

async function readTracedWorker(logPath: string, nowMs: number): Promise<TracedWorker | null> {
  try {
    const s = await stat(logPath);
    const raw = await readFile(logPath, 'utf8');
    const lines = raw.split('\n').filter(l => l.trim());
    const lastLines = lines.slice(-8);
    const modifiedAt = s.mtime.toISOString();
    const name = logPath.split('/').pop()!.replace('.log', '');
    const { status, retryCount, reason } = detectStuck(lastLines, modifiedAt, nowMs);
    return { name, logFile: logPath, modifiedAt, status, retryCount, reason };
  } catch {
    return null;
  }
}

export async function fetchFleetTracing(): Promise<Result<FleetTracingData>> {
  const nowMs = Date.now();
  const logPaths = await getLogPaths();
  const results = await Promise.all(logPaths.map(p => readTracedWorker(p, nowMs)));
  const workers = results.filter((w): w is TracedWorker => w !== null);
  const stuckCount = workers.filter(w => w.status === 'stuck').length;
  return makeOk({
    workers,
    stuckCount,
    note: workers.length === 0
      ? 'No worker logs found.'
      : `${workers.length} worker(s) traced — ${stuckCount} stuck.`,
  });
}
