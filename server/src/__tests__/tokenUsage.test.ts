import { describe, it, expect } from 'vitest';
import { aggregateTokensByDay } from '../modules/tokenUsage';

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
