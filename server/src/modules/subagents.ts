import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { makeOk, SubagentsData, WorkerLog, Result } from '../types';

const DEFAULT_LOG_GLOBS = '/tmp/*-worker.log,/tmp/tf-watch.log';

async function expandGlob(pattern: string): Promise<string[]> {
  const lastSlash = pattern.lastIndexOf('/');
  if (lastSlash === -1) return [];
  const dir = pattern.substring(0, lastSlash) || '/';
  const filePattern = pattern.substring(lastSlash + 1);

  if (!filePattern.includes('*')) {
    return [pattern];
  }

  const re = new RegExp(
    '^' + filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  try {
    const entries = await readdir(dir);
    return entries.filter(e => re.test(e)).map(e => join(dir, e));
  } catch {
    return [];
  }
}

async function getLogPaths(): Promise<string[]> {
  const globsEnv = process.env.MC_WORKER_LOG_GLOB ?? DEFAULT_LOG_GLOBS;
  const patterns = globsEnv.split(',').map(p => p.trim()).filter(Boolean);
  const all = new Set<string>();
  for (const pattern of patterns) {
    const expanded = await expandGlob(pattern);
    expanded.forEach(p => all.add(p));
  }
  return [...all];
}

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

export async function fetchSubagents(): Promise<Result<SubagentsData>> {
  const logPaths = await getLogPaths();
  const results = await Promise.all(logPaths.map(readWorkerLog));
  const workers = results.filter((w): w is WorkerLog => w !== null);
  return makeOk({
    workers,
    note: workers.length === 0 ? 'No worker logs found.' : `${workers.length} worker log(s) found.`,
  });
}
