import { shellJson } from '../utils/shell';
import { makeOk, makeErr, PullRequest, Result } from '../types';

const DEFAULT_REPOS = ['ecimionatto/daily-train-app', 'ecimionatto/crescendo-app'];

// Raw shapes returned by gh CLI
interface GhCheck {
  state?: string;
  status?: string;
  conclusion?: string;
  __typename?: string;
}

interface GhPR {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  author: { login: string } | null;
  updatedAt: string;
  url: string;
  statusCheckRollup: GhCheck[] | null;
}

export function deriveCiStatus(checks: GhCheck[]): PullRequest['ciStatus'] {
  if (checks.length === 0) return 'none';
  const states = checks.map(c => (c.state ?? c.conclusion ?? c.status ?? '').toUpperCase());
  if (states.some(s => s === 'PENDING' || s === 'IN_PROGRESS' || s === 'QUEUED' || s === 'WAITING')) return 'pending';
  if (states.some(s => s === 'FAILURE' || s === 'FAILED' || s === 'ERROR' || s === 'TIMED_OUT' || s === 'CANCELLED')) return 'failure';
  if (states.every(s => s === 'SUCCESS' || s === '' || s === 'NEUTRAL' || s === 'SKIPPED')) {
    if (states.some(s => s === 'SUCCESS')) return 'success';
  }
  return 'unknown';
}

export function transformPR(raw: GhPR, repo: string): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    state: (raw.state.toLowerCase() as PullRequest['state']) || 'open',
    repo,
    author: raw.author?.login ?? 'unknown',
    updatedAt: raw.updatedAt,
    ciStatus: deriveCiStatus(raw.statusCheckRollup ?? []),
    url: raw.url,
    isDraft: raw.isDraft ?? false,
  };
}

async function fetchRepoPRs(repo: string, state: 'open' | 'merged'): Promise<PullRequest[]> {
  const fields = 'number,title,state,isDraft,author,updatedAt,url,statusCheckRollup';
  const args = state === 'open'
    ? ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '20', '--json', fields]
    : ['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '10', '--json', fields];

  const result = await shellJson<GhPR[]>('gh', args, 20_000);
  if (!result.ok) return [];
  return (result.data ?? []).map(pr => transformPR(pr, repo));
}

export async function fetchPRs(): Promise<Result<PullRequest[]>> {
  const repos = (process.env.REPOS ?? DEFAULT_REPOS.join(',')).split(',').map(r => r.trim()).filter(Boolean);

  try {
    const results = await Promise.all(
      repos.flatMap(repo => [
        fetchRepoPRs(repo, 'open'),
        fetchRepoPRs(repo, 'merged'),
      ])
    );
    const all = results.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return makeOk(all);
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
