import { shellJson } from '../utils/shell';
import { makeOk, makeErr, WorkflowRun, Result } from '../types';

const DEFAULT_REPOS = ['ecimionatto/daily-train-app', 'ecimionatto/crescendo-app'];

interface GhRun {
  databaseId: number;
  name: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  event: string;
}

export function transformWorkflowRun(raw: GhRun, repo: string): WorkflowRun {
  let durationSeconds: number | null = null;
  if (raw.createdAt && raw.updatedAt) {
    const ms = new Date(raw.updatedAt).getTime() - new Date(raw.createdAt).getTime();
    if (ms > 0) durationSeconds = Math.round(ms / 1000);
  }
  return {
    id: raw.databaseId,
    name: raw.name,
    workflowName: raw.workflowName ?? raw.name,
    status: (raw.status ?? 'unknown').toLowerCase(),
    conclusion: raw.conclusion ? raw.conclusion.toLowerCase() : null,
    startedAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    durationSeconds,
    repo,
    event: raw.event ?? 'unknown',
  };
}

async function fetchRepoRuns(repo: string): Promise<WorkflowRun[]> {
  const fields = 'databaseId,name,workflowName,status,conclusion,createdAt,updatedAt,event';
  const result = await shellJson<GhRun[]>(
    'gh',
    ['run', 'list', '--repo', repo, '--limit', '20', '--json', fields],
    20_000
  );
  if (!result.ok) return [];
  return (result.data ?? []).map(run => transformWorkflowRun(run, repo));
}

export async function fetchWorkflows(): Promise<Result<WorkflowRun[]>> {
  const repos = (process.env.REPOS ?? DEFAULT_REPOS.join(',')).split(',').map(r => r.trim()).filter(Boolean);

  try {
    const results = await Promise.all(repos.map(fetchRepoRuns));
    const all = results.flat().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return makeOk(all);
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
