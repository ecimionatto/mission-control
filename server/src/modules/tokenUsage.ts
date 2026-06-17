import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { makeOk, makeErr, DayUsage, TokenUsageData, CostSpikeResult, Result } from '../types';

const MAX_FILES = 50;

// verify against current Anthropic pricing — https://www.anthropic.com/pricing
export interface ModelRates {
  input: number;     // USD per 1M tokens
  output: number;    // USD per 1M tokens
  cacheRead: number; // USD per 1M tokens (= input * 0.1)
  cacheWrite: number; // USD per 1M tokens (= input * 1.25)
}

export const PRICING: Record<string, ModelRates> = {
  opus:   { input: 15,  output: 75, cacheRead: 1.5,    cacheWrite: 18.75 },
  sonnet: { input: 3,   output: 15, cacheRead: 0.3,    cacheWrite: 3.75  },
  haiku:  { input: 1,   output: 5,  cacheRead: 0.1,    cacheWrite: 1.25  },
};

export function dayCostUsd(day: DayUsage, rates: ModelRates = PRICING.opus): number {
  const M = 1_000_000;
  return (
    (day.inputTokens / M) * rates.input +
    (day.outputTokens / M) * rates.output +
    (day.cacheReadTokens / M) * rates.cacheRead +
    (day.cacheWriteTokens / M) * rates.cacheWrite
  );
}

export function detectCostSpike(days: { date: string; costUsd: number }[]): CostSpikeResult {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  if (!latest || sorted.length < 3) {
    return { spike: false, latestUsd: latest?.costUsd ?? 0, baselineUsd: 0, ratio: 0 };
  }
  // Up to 7 days immediately before the latest
  const priorDays = sorted.slice(-8, -1);
  const baselineUsd = priorDays.reduce((s, d) => s + d.costUsd, 0) / priorDays.length;
  const ratio = baselineUsd > 0 ? latest.costUsd / baselineUsd : 0;
  return {
    spike: baselineUsd > 0 && ratio > 1.5,
    latestUsd: latest.costUsd,
    baselineUsd,
    ratio,
  };
}

function getJsonlDir(): string | null {
  const env = process.env.MC_CLAUDE_PROJECT_DIR;
  if (env) return env.replace(/^~/, homedir());
  return null;
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
    usage?: MessageUsage;
  };
  // direct usage (less common)
  usage?: MessageUsage;
  timestamp?: string | number;
}

// Exported for tests
export function aggregateTokensByDay(
  lines: string[],
  fileDateHint: string
): Record<string, DayUsage> {
  const byDay: Record<string, DayUsage> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: JournalEntry;
    try {
      entry = JSON.parse(trimmed) as JournalEntry;
    } catch {
      continue;
    }

    const usage: MessageUsage | undefined =
      entry.message?.usage ?? entry.usage;

    if (!usage) continue;

    // Derive date: prefer timestamp field, fall back to file mtime date
    let date = fileDateHint;
    if (entry.timestamp) {
      const ts = typeof entry.timestamp === 'number'
        ? new Date(entry.timestamp * 1000)
        : new Date(entry.timestamp);
      if (!isNaN(ts.getTime())) date = ts.toISOString().slice(0, 10);
    }

    if (!byDay[date]) {
      byDay[date] = {
        date,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
    }

    byDay[date].inputTokens += usage.input_tokens ?? 0;
    byDay[date].outputTokens += usage.output_tokens ?? 0;
    byDay[date].cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    byDay[date].cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
  }

  return byDay;
}

export async function fetchTokenUsage(): Promise<Result<TokenUsageData>> {
  const JSONL_DIR = getJsonlDir();
  if (!JSONL_DIR) {
    return makeErr('MC_CLAUDE_PROJECT_DIR not configured — set it to your Claude project directory path (e.g. ~/.claude/projects/-home-yourname-workspace)');
  }
  try {
    const files = await readdir(JSONL_DIR);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    // Sort by mtime descending, take recent MAX_FILES
    const withStats = await Promise.all(
      jsonlFiles.map(async f => {
        try {
          const s = await stat(join(JSONL_DIR, f));
          return { name: f, mtime: s.mtime };
        } catch {
          return null;
        }
      })
    );

    const sorted = withStats
      .filter((x): x is { name: string; mtime: Date } => x !== null)
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, MAX_FILES);

    const combined: Record<string, DayUsage> = {};

    await Promise.all(
      sorted.map(async ({ name, mtime }) => {
        const fileDateHint = mtime.toISOString().slice(0, 10);
        try {
          const content = await readFile(join(JSONL_DIR, name), 'utf8');
          const lines = content.split('\n');
          const partial = aggregateTokensByDay(lines, fileDateHint);
          for (const [day, usage] of Object.entries(partial)) {
            if (!combined[day]) {
              combined[day] = { ...usage };
            } else {
              combined[day].inputTokens += usage.inputTokens;
              combined[day].outputTokens += usage.outputTokens;
              combined[day].cacheReadTokens += usage.cacheReadTokens;
              combined[day].cacheWriteTokens += usage.cacheWriteTokens;
            }
          }
        } catch {
          // skip unreadable files
        }
      })
    );

    const days = Object.values(combined)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, costUsd: dayCostUsd(d) }));

    const totalInputTokens = days.reduce((s, d) => s + d.inputTokens, 0);
    const totalOutputTokens = days.reduce((s, d) => s + d.outputTokens, 0);
    const totalCacheReadTokens = days.reduce((s, d) => s + d.cacheReadTokens, 0);
    const totalCacheWriteTokens = days.reduce((s, d) => s + d.cacheWriteTokens, 0);
    const totalCostUsd = days.reduce((s, d) => s + (d.costUsd ?? 0), 0);
    const costSpike = detectCostSpike(days.map(d => ({ date: d.date, costUsd: d.costUsd ?? 0 })));

    return makeOk({
      days,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheWriteTokens,
      totalCostUsd,
      costSpike,
      filesScanned: sorted.length,
      note: `Scanned ${sorted.length} of ${jsonlFiles.length} JSONL files (most recent). Usage extracted from assistant message headers.`,
    });
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
