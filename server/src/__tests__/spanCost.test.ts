import { describe, it, expect } from 'vitest';
import {
  projectLabel,
  modelKeyFromString,
  aggregateSession,
  computeBudget,
} from '../modules/spanCost';

describe('projectLabel', () => {
  it('maps clawbot-workspace to "Louis main"', () => {
    expect(projectLabel('-home-ecimio-clawbot-workspace')).toBe('Louis main');
  });

  it('maps daily-train-app to "DTrain"', () => {
    expect(projectLabel('-home-ecimio-daily-train-app')).toBe('DTrain');
  });

  it('maps crescendo-app to "Crescendo"', () => {
    expect(projectLabel('-home-ecimio-crescendo-app')).toBe('Crescendo');
  });

  it('maps mission-control to "Mission Control"', () => {
    expect(projectLabel('-home-ecimio-mission-control')).toBe('Mission Control');
  });

  it('maps statura to "Statura"', () => {
    expect(projectLabel('-home-ecimio-statura')).toBe('Statura');
  });

  it('maps clawbot-ops to "Ops"', () => {
    expect(projectLabel('-home-ecimio-clawbot-ops')).toBe('Ops');
  });

  it('falls back to last path segment with hyphens replaced by spaces', () => {
    expect(projectLabel('-home-ecimio-bikini-prep-app')).toBe('home ecimio bikini prep app');
  });

  it('fallback trims leading/trailing spaces from encoded dir name', () => {
    expect(projectLabel('-tmp-race-week-pack')).toBe('tmp race week pack');
  });

  it('crescendo-app matches even for a worktree variant (contains check)', () => {
    expect(projectLabel('-home-ecimio-crescendo-app-wt-am98')).toBe('Crescendo');
  });
});

describe('modelKeyFromString', () => {
  it('defaults to opus when model is undefined', () => {
    expect(modelKeyFromString(undefined)).toBe('opus');
  });

  it('maps a claude-opus id to opus', () => {
    expect(modelKeyFromString('claude-opus-4-8')).toBe('opus');
  });

  it('maps a claude-sonnet id to sonnet', () => {
    expect(modelKeyFromString('claude-sonnet-4-6')).toBe('sonnet');
  });

  it('maps a claude-haiku id to haiku', () => {
    expect(modelKeyFromString('claude-haiku-4-5-20251001')).toBe('haiku');
  });

  it('defaults unknown model strings to opus', () => {
    expect(modelKeyFromString('gpt-4o')).toBe('opus');
  });

  it('is case-insensitive', () => {
    expect(modelKeyFromString('Claude-SONNET-4-6')).toBe('sonnet');
  });
});

describe('aggregateSession', () => {
  it('returns all-zero totals for empty input', () => {
    const agg = aggregateSession([]);
    expect(agg).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
    });
  });

  it('sums tokens across message.usage entries', () => {
    const lines = [
      JSON.stringify({ message: { role: 'assistant', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } } }),
      JSON.stringify({ message: { role: 'assistant', usage: { input_tokens: 200, output_tokens: 25 } } }),
    ];
    const agg = aggregateSession(lines);
    expect(agg.inputTokens).toBe(300);
    expect(agg.outputTokens).toBe(75);
    expect(agg.cacheReadTokens).toBe(10);
    expect(agg.cacheWriteTokens).toBe(5);
  });

  it('reads the direct usage field when message.usage is absent', () => {
    const lines = [
      JSON.stringify({ usage: { input_tokens: 1000, output_tokens: 500 } }),
    ];
    const agg = aggregateSession(lines);
    expect(agg.inputTokens).toBe(1000);
    expect(agg.outputTokens).toBe(500);
  });

  it('computes cost at opus rates by default (1M in + 1M out => $90)', () => {
    const lines = [
      JSON.stringify({ message: { usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 } } }),
    ];
    expect(aggregateSession(lines).costUsd).toBeCloseTo(90, 4);
  });

  it('uses sonnet rates when the entry declares a sonnet model (1M in + 1M out => $18)', () => {
    const lines = [
      JSON.stringify({ message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 } } }),
    ];
    expect(aggregateSession(lines).costUsd).toBeCloseTo(18, 4);
  });

  it('reads a top-level model field for pricing', () => {
    const lines = [
      JSON.stringify({ model: 'claude-haiku-4-5', usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 } }),
    ];
    expect(aggregateSession(lines).costUsd).toBeCloseTo(6, 4);
  });

  it('accumulates cost per entry using each entry\'s own model', () => {
    const lines = [
      JSON.stringify({ message: { model: 'claude-opus-4-8', usage: { input_tokens: 1_000_000 } } }),   // $15
      JSON.stringify({ message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1_000_000 } } }), // $3
    ];
    expect(aggregateSession(lines).costUsd).toBeCloseTo(18, 4);
  });

  it('skips blank lines and unparseable JSON', () => {
    const lines = [
      '',
      '   ',
      'not json',
      JSON.stringify({ message: { usage: { input_tokens: 100 } } }),
    ];
    expect(aggregateSession(lines).inputTokens).toBe(100);
  });

  it('ignores entries with no usage payload', () => {
    const lines = [
      JSON.stringify({ message: { role: 'user', content: 'hi' } }),
      JSON.stringify({ type: 'summary' }),
    ];
    expect(aggregateSession(lines)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
    });
  });

  it('includes cache read and write tokens in cost (opus)', () => {
    const lines = [
      JSON.stringify({ message: { usage: { cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 } } }),
    ];
    // $1.50 (read) + $18.75 (write)
    expect(aggregateSession(lines).costUsd).toBeCloseTo(20.25, 4);
  });
});

describe('computeBudget', () => {
  it('status ok when under 75% of budget', () => {
    const b = computeBudget(5, 1);
    expect(b.status).toBe('ok');
    expect(b.pct).toBeCloseTo(20, 4);
    expect(b.dailyBudgetUsd).toBe(5);
    expect(b.todayCostUsd).toBe(1);
  });

  it('status warn at exactly 75%', () => {
    expect(computeBudget(4, 3).status).toBe('warn'); // 75%
  });

  it('status warn between 75% and 90%', () => {
    expect(computeBudget(10, 8).status).toBe('warn'); // 80%
  });

  it('status critical at exactly 90%', () => {
    expect(computeBudget(10, 9).status).toBe('critical'); // 90%
  });

  it('status critical above 90%', () => {
    expect(computeBudget(5, 5).status).toBe('critical'); // 100%
  });

  it('status critical when over budget', () => {
    const b = computeBudget(5, 10);
    expect(b.status).toBe('critical');
    expect(b.pct).toBeCloseTo(200, 4);
  });

  it('pct is 0 (and status ok) when budget is 0 to avoid divide-by-zero', () => {
    const b = computeBudget(0, 5);
    expect(b.pct).toBe(0);
    expect(b.status).toBe('ok');
  });

  it('just below 75% is still ok', () => {
    expect(computeBudget(100, 74.9).status).toBe('ok');
  });

  it('just below 90% is warn', () => {
    expect(computeBudget(100, 89.9).status).toBe('warn');
  });
});
