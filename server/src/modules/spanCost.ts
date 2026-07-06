import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { makeOk, makeErr, Result, SpanCostData } from '../types';
import { PRICING, ModelRates } from './tokenUsage';

/** Cap of most-recent JSONL files scanned per project directory. */
const MAX_FILES_PER_PROJECT = 20;
/** Number of most-expensive sessions returned. */
const TOP_SESSIONS = 15;

function projectsRoot(): string {
  const env = process.env.MC_CLAUDE_PROJECTS_DIR;
  if (env) return env.replace(/^~/, homedir());
  return join(homedir(), '.claude', 'projects');
}

function dailyBudgetUsd(): number {
  const raw = process.env.MC_DAILY_BUDGET_USD;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5.0;
}

/**
 * Map a Claude project directory name to a friendly label.
 * Recognized projects get curated names; everything else falls back to the
 * encoded directory name with hyphens turned into spaces.
 */
export function projectLabel(dirName: string): string {
  if (dirName.includes('clawbot-workspace')) return 'Louis main';
  if (dirName.includes('daily-train-app')) return 'DTrain';
  if (dirName.includes('crescendo-app')) return 'Crescendo';
  if (dirName.includes('mission-control')) return 'Mission Control';
  if (dirName.includes('statura')) return 'Statura';
  if (dirName.includes('clawbot-ops')) return 'Ops';
  const lastSegment = dirName.split('/').pop() ?? dirName;
  return lastSegment.replace(/-/g, ' ').trim();
}

/** Map a model id string to a PRICING key, defaulting to opus. */
export function modelKeyFromString(model?: string): keyof typeof PRICING {
  if (!model) return 'opus';
  const m = model.toLowerCase();
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'opus';
}

interface MessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface JournalEntry {
  message?: {
    role?: string;
    model?: string;
    usage?: MessageUsage;
  };
  model?: string;
  usage?: MessageUsage;
}

export interface SessionAggregate {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

const M = 1_000_000;

function usageCostUsd(usage: MessageUsage, rates: ModelRates): number {
  return (
    ((usage.input_tokens ?? 0) / M) * rates.input +
    ((usage.output_tokens ?? 0) / M) * rates.output +
    ((usage.cache_read_input_tokens ?? 0) / M) * rates.cacheRead +
    ((usage.cache_creation_input_tokens ?? 0) / M) * rates.cacheWrite
  );
}

/**
 * Aggregate token totals and per-entry cost for a single session's JSONL lines.
 * Cost uses each entry's own model (parsed from message.model or model), so a
 * mixed-model session is priced correctly; entries default to opus rates.
 */
export function aggregateSession(lines: string[]): SessionAggregate {
  const agg: SessionAggregate = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: JournalEntry;
    try {
      entry = JSON.parse(trimmed) as JournalEntry;
    } catch {
      continue;
    }

    const usage = entry.message?.usage ?? entry.usage;
    if (!usage) continue;

    const rates = PRICING[modelKeyFromString(entry.message?.model ?? entry.model)];

    agg.inputTokens += usage.input_tokens ?? 0;
    agg.outputTokens += usage.output_tokens ?? 0;
    agg.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    agg.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    agg.costUsd += usageCostUsd(usage, rates);
  }

  return agg;
}

export interface Budget {
  dailyBudgetUsd: number;
  todayCostUsd: number;
  pct: number;
  status: 'ok' | 'warn' | 'critical';
}

/** Budget gauge: ok < 75%, warn 75–90%, critical ≥ 90% of the daily budget. */
export function computeBudget(dailyBudgetUsd: number, todayCostUsd: number): Budget {
  const pct = dailyBudgetUsd > 0 ? (todayCostUsd / dailyBudgetUsd) * 100 : 0;
  const status: Budget['status'] = pct >= 90 ? 'critical' : pct >= 75 ? 'warn' : 'ok';
  return { dailyBudgetUsd, todayCostUsd, pct, status };
}

type ScannedSession = SpanCostData['sessions'][number];

export async function fetchSpanCost(): Promise<Result<SpanCostData>> {
  const root = projectsRoot();
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    const projectDirs = dirents.filter(d => d.isDirectory());

    const allSessions: ScannedSession[] = [];

    await Promise.all(
      projectDirs.map(async dir => {
        const project = projectLabel(dir.name);
        const dirPath = join(root, dir.name);

        let files: string[];
        try {
          files = (await readdir(dirPath)).filter(f => f.endsWith('.jsonl'));
        } catch {
          return;
        }

        const withStats = await Promise.all(
          files.map(async f => {
            try {
              const s = await stat(join(dirPath, f));
              return { name: f, mtime: s.mtime };
            } catch {
              return null;
            }
          })
        );

        const recent = withStats
          .filter((x): x is { name: string; mtime: Date } => x !== null)
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
          .slice(0, MAX_FILES_PER_PROJECT);

        await Promise.all(
          recent.map(async ({ name, mtime }) => {
            try {
              const content = await readFile(join(dirPath, name), 'utf8');
              const agg = aggregateSession(content.split('\n'));
              allSessions.push({
                project,
                sessionId: name.replace(/\.jsonl$/, ''),
                costUsd: agg.costUsd,
                inputTokens: agg.inputTokens,
                outputTokens: agg.outputTokens,
                cacheReadTokens: agg.cacheReadTokens,
                lastActiveAt: mtime.toISOString(),
              });
            } catch {
              // skip unreadable files
            }
          })
        );
      })
    );

    // Per-project aggregate cost + session count across everything scanned.
    const projectTotals = new Map<string, { costUsd: number; sessionCount: number }>();
    for (const s of allSessions) {
      const cur = projectTotals.get(s.project) ?? { costUsd: 0, sessionCount: 0 };
      cur.costUsd += s.costUsd;
      cur.sessionCount += 1;
      projectTotals.set(s.project, cur);
    }
    const byProject = Array.from(projectTotals.entries())
      .map(([project, t]) => ({ project, costUsd: t.costUsd, sessionCount: t.sessionCount }))
      .sort((a, b) => b.costUsd - a.costUsd);

    // Today's cost (UTC): sessions last active today.
    const today = new Date().toISOString().slice(0, 10);
    const todayCostUsd = allSessions
      .filter(s => s.lastActiveAt.slice(0, 10) === today)
      .reduce((sum, s) => sum + s.costUsd, 0);

    const sessions = [...allSessions]
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, TOP_SESSIONS);

    const budget = computeBudget(dailyBudgetUsd(), todayCostUsd);

    return makeOk({
      sessions,
      byProject,
      budget,
      note: `Scanned ${allSessions.length} sessions across ${byProject.length} projects (top ${MAX_FILES_PER_PROJECT} recent files each). Costs estimated from message usage headers; model inferred per entry, defaulting to opus.`,
    });
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
