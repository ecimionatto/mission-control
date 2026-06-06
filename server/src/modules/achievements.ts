import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { shellJson } from '../utils/shell';
import { makeOk, makeErr, Achievement, AchievementsData, Result } from '../types';

const REPORTS_DIR = join(homedir(), 'clawbot', 'reports');
const DEFAULT_REPOS = ['ecimionatto/daily-train-app', 'ecimionatto/crescendo-app'];

interface GhMergedPR {
  number: number;
  title: string;
  mergedAt: string;
  url: string;
  author: { login: string } | null;
}

// Exported for tests
export function extractThemeFromReport(content: string): string | undefined {
  // Look for "**Theme:**" or "**Theme**: " line
  const themeMatch = content.match(/\*\*Theme[:\s*]+\**\s*(.+)/i);
  if (themeMatch) return themeMatch[1].trim().replace(/\*+$/, '').trim();
  // Fallback: second heading
  const h2 = content.match(/^##\s+(.+)/m);
  if (h2) return h2[1].trim();
  return undefined;
}

export function parseDateFromReportFilename(filename: string): string {
  // Formats: "2026-06-05.md", "crescendo-2026-05-19.md"
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? filename.replace('.md', '');
}

async function listRecentReports(): Promise<AchievementsData['recentReports']> {
  try {
    const files = await readdir(REPORTS_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse().slice(0, 20);
    const reports: AchievementsData['recentReports'] = [];
    for (const file of mdFiles) {
      const date = parseDateFromReportFilename(file);
      let theme: string | undefined;
      try {
        const content = await readFile(join(REPORTS_DIR, file), 'utf8');
        theme = extractThemeFromReport(content);
      } catch {
        // can't read file, that's fine
      }
      reports.push({ name: file.replace('.md', ''), date, theme });
    }
    return reports;
  } catch {
    return [];
  }
}

async function fetchMergedPRs(repo: string): Promise<Achievement[]> {
  const result = await shellJson<GhMergedPR[]>(
    'gh',
    ['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '10', '--json', 'number,title,mergedAt,url,author'],
    15_000
  );
  if (!result.ok) return [];
  return (result.data ?? []).map(pr => ({
    type: 'merged_pr' as const,
    title: `#${pr.number}: ${pr.title}`,
    date: pr.mergedAt?.slice(0, 10) ?? 'unknown',
    repo,
    prNumber: pr.number,
    url: pr.url,
    author: pr.author?.login,
  }));
}

export async function fetchAchievements(): Promise<Result<AchievementsData>> {
  try {
    const repos = (process.env.REPOS ?? DEFAULT_REPOS.join(',')).split(',').map(r => r.trim()).filter(Boolean);
    const [recentReports, ...prArrays] = await Promise.all([
      listRecentReports(),
      ...repos.map(fetchMergedPRs),
    ]);
    const items: Achievement[] = prArrays
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date));
    return makeOk({ items, recentReports });
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
