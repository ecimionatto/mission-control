import path from 'path';
import { shell } from '../utils/shell';
import { makeOk, makeErr, Result, AiRatioData } from '../types';

// Trailer-based detection UNDERCOUNTS by ~15-20%: humans often use AI without
// committing the Co-Authored-By trailer. This metric is a floor, not exact.

export function getLocalRepos(): string[] {
  const raw = process.env.MC_LOCAL_REPOS?.trim() ?? '';
  if (!raw) return [];
  return raw.split(',').map(r => r.trim()).filter(Boolean);
}

const WINDOW_DAYS = 30;

export interface CommitRecord {
  hash: string;
  authorEmail: string;
  body: string;
}

// Match AI/bot authorship by EMAIL only, precisely: the Claude co-author
// trailer email (noreply@anthropic.com) or a GitHub App "[bot]" email. We do
// NOT match bare "claude"/"bot" substrings — those false-positive on real human
// addresses like claudia@, talbot@, abbott@ and would over-count.
const BOT_PATTERN = /noreply@anthropic\.com|\[bot\]/i;

export function isAiAuthored(commit: CommitRecord): boolean {
  if (BOT_PATTERN.test(commit.authorEmail)) return true;
  const trailerRe = /^Co-Authored-By:.*?<([^>]+)>/gim;
  let match: RegExpExecArray | null;
  while ((match = trailerRe.exec(commit.body)) !== null) {
    if (BOT_PATTERN.test(match[1])) return true;
  }
  return false;
}

export function parseGitLog(stdout: string): CommitRecord[] {
  if (!stdout.trim()) return [];
  return stdout
    .split('\x1e')
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const parts = record.split('\x1f');
      const hash = (parts[0] ?? '').trim();
      const authorEmail = (parts[1] ?? '').trim();
      const body = parts.slice(2).join('\x1f').trim();
      return { hash, authorEmail, body };
    })
    .filter(c => c.hash !== '');
}

export function computeAiRatio(commits: CommitRecord[]): { total: number; aiAuthored: number; ratio: number } {
  const total = commits.length;
  const aiAuthored = commits.filter(isAiAuthored).length;
  return { total, aiAuthored, ratio: total === 0 ? 0 : aiAuthored / total };
}

async function fetchRepoRatio(repoPath: string): Promise<{ repo: string; total: number; aiAuthored: number; ratio: number } | null> {
  const result = await shell(
    'git',
    ['-C', repoPath, 'log', `--since=${WINDOW_DAYS} days ago`, '--format=%H%x1f%ae%x1f%B%x1e'],
    20_000
  );
  if (!result.ok) return null;
  const commits = parseGitLog(result.stdout);
  const stats = computeAiRatio(commits);
  return { repo: path.basename(repoPath), ...stats };
}

export async function fetchAiRatio(): Promise<Result<AiRatioData>> {
  try {
    const repoPaths = getLocalRepos();
    if (repoPaths.length === 0) {
      return makeOk({ repos: [], overall: { total: 0, aiAuthored: 0, ratio: 0 }, windowDays: WINDOW_DAYS });
    }
    const results = await Promise.all(repoPaths.map(fetchRepoRatio));
    const repos = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const totals = repos.reduce(
      (acc, r) => ({ total: acc.total + r.total, aiAuthored: acc.aiAuthored + r.aiAuthored }),
      { total: 0, aiAuthored: 0 }
    );
    return makeOk({
      repos,
      overall: {
        ...totals,
        ratio: totals.total === 0 ? 0 : totals.aiAuthored / totals.total,
      },
      windowDays: WINDOW_DAYS,
    });
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
