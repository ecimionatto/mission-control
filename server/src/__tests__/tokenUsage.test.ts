import { describe, it, expect } from 'vitest';
import { aggregateTokensByDay, computeCacheHitRate, computeCacheReadWriteRatio } from '../modules/tokenUsage';

const DATE_HINT = '2026-06-01';

describe('aggregateTokensByDay', () => {
  it('returns empty for empty input', () => {
    expect(aggregateTokensByDay([], DATE_HINT)).toEqual({});
  });

  it('skips blank lines and invalid JSON', () => {
    const lines = ['', '   ', 'not json', '{}'];
    expect(aggregateTokensByDay(lines, DATE_HINT)).toEqual({});
  });

  it('extracts usage from message.usage field (Claude Code JSONL format)', () => {
    const entry = {
      parentUuid: 'abc',
      message: {
        role: 'assistant',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 10,
        },
      },
    };
    const result = aggregateTokensByDay([JSON.stringify(entry)], DATE_HINT);
    expect(result[DATE_HINT]).toEqual({
      date: DATE_HINT,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 200,
      cacheWriteTokens: 10,
    });
  });

  it('aggregates multiple entries for the same day', () => {
    const entry = (input: number) => JSON.stringify({
      message: { usage: { input_tokens: input, output_tokens: 0 } },
    });
    const result = aggregateTokensByDay([entry(100), entry(200)], DATE_HINT);
    expect(result[DATE_HINT].inputTokens).toBe(300);
  });

  it('splits entries across different days by timestamp', () => {
    const e1 = JSON.stringify({
      timestamp: '2026-06-01T10:00:00Z',
      message: { usage: { input_tokens: 100, output_tokens: 10 } },
    });
    const e2 = JSON.stringify({
      timestamp: '2026-06-02T10:00:00Z',
      message: { usage: { input_tokens: 200, output_tokens: 20 } },
    });
    const result = aggregateTokensByDay([e1, e2], DATE_HINT);
    expect(result['2026-06-01'].inputTokens).toBe(100);
    expect(result['2026-06-02'].inputTokens).toBe(200);
  });

  it('uses fileDateHint when timestamp is absent', () => {
    const entry = JSON.stringify({ message: { usage: { input_tokens: 77, output_tokens: 3 } } });
    const result = aggregateTokensByDay([entry], '2026-05-15');
    expect(result['2026-05-15'].inputTokens).toBe(77);
  });

  it('handles missing optional token fields with 0', () => {
    const entry = JSON.stringify({ message: { usage: { input_tokens: 5 } } });
    const result = aggregateTokensByDay([entry], DATE_HINT);
    expect(result[DATE_HINT].outputTokens).toBe(0);
    expect(result[DATE_HINT].cacheReadTokens).toBe(0);
    expect(result[DATE_HINT].cacheWriteTokens).toBe(0);
  });
});

describe('computeCacheHitRate', () => {
  it('returns fraction of prompt tokens served from cache', () => {
    // 200 / (200 + 10 + 100) = 200/310 ≈ 0.645
    const rate = computeCacheHitRate(200, 10, 100);
    expect(rate).toBeCloseTo(200 / 310);
  });

  it('returns 0 when all token counts are zero (no NaN/Infinity)', () => {
    expect(computeCacheHitRate(0, 0, 0)).toBe(0);
  });

  it('returns 0 when no cache tokens but there are input tokens', () => {
    expect(computeCacheHitRate(0, 0, 500)).toBe(0);
  });

  it('returns 1.0 for all-cache scenario (only cache reads, no writes or input)', () => {
    expect(computeCacheHitRate(1000, 0, 0)).toBe(1.0);
  });

  it('returns 0 when cache reads are zero but writes and input exist', () => {
    expect(computeCacheHitRate(0, 50, 200)).toBe(0);
  });
});

describe('computeCacheReadWriteRatio', () => {
  it('returns reads divided by writes when both are nonzero', () => {
    // 200 / 10 = 20
    expect(computeCacheReadWriteRatio(200, 10)).toBe(20);
  });

  it('returns null when writes are zero (guard divide-by-zero)', () => {
    expect(computeCacheReadWriteRatio(0, 0)).toBeNull();
  });

  it('returns null when writes are zero but reads are nonzero', () => {
    expect(computeCacheReadWriteRatio(500, 0)).toBeNull();
  });

  it('returns 0 when reads are zero and writes are nonzero', () => {
    expect(computeCacheReadWriteRatio(0, 100)).toBe(0);
  });

  it('returns ratio below break-even for under-amortized cache', () => {
    // 1 read per write — below the 1.4 break-even
    expect(computeCacheReadWriteRatio(100, 100)).toBe(1.0);
  });
});
