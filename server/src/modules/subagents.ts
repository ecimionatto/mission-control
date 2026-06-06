import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { makeOk, SubagentsData, WorkerLog, Result } from '../types';

const LOG_PATTERNS = [
  '/tmp/a11y-worker.log',
  '/tmp/mc-worker.log',
  '/tmp/musickit-worker.log',
  '/tmp/tf-watch.log',
];

async function readWorkerLog(logPath: string): Promise<WorkerLog | null> {
  try {
    const s = await stat(logPath);
    const raw = await readFile(logPath, 'utf8');
    const lines = raw.split('\n').filter(l => l.trim());
    const lastLines = lines.slice(-8);
    return {
      name: logPath.split('/').pop()!.replace('.log', ''),
      logFile: logPath,
      lastLines,
      modifiedAt: s.mtime.toISOString(),
      sizeBytes: s.size,
    };
  } catch {
    return null;
  }
}

async function discoverWorkerLogs(): Promise<string[]> {
  // Also glob /tmp/*-worker.log dynamically
  try {
    const entries = await readdir('/tmp');
    const dynamic = entries
      .filter(e => e.endsWith('-worker.log') || e.endsWith('.log'))
      .map(e => join('/tmp', e));
    const all = new Set([...LOG_PATTERNS, ...dynamic]);
    return [...all];
  } catch {
    return LOG_PATTERNS;
  }
}

export async function fetchSubagents(): Promise<Result<SubagentsData>> {
  const logPaths = await discoverWorkerLogs();
  const results = await Promise.all(logPaths.map(readWorkerLog));
  const workers = results.filter((w): w is WorkerLog => w !== null);
  return makeOk({
    workers,
    note: workers.length === 0 ? 'No worker logs found in /tmp.' : `${workers.length} worker log(s) found.`,
  });
}
