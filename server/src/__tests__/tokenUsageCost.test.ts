import { describe, it, expect } from 'vitest';
import { dayCostUsd, detectCostSpike, PRICING } from '../modules/tokenUsage';
import type { DayUsage } from '../types';

const BASE_DAY: DayUsage = {
  date: '2026-06-01',
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe('dayCostUsd', () => {
  it('1M input + 1M output at opus rates => $90', () => {
    const day = { ...BASE_DAY, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(dayCostUsd(day, PRICING.opus)).toBeCloseTo(90, 4); // $15 + $75
  });

  it('1M input + 1M output at sonnet rates => $18', () => {
    const day = { ...BASE_DAY, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(dayCostUsd(day, PRICING.sonnet)).toBeCloseTo(18, 4); // $3 + $15
  });

  it('1M input + 1M output at haiku rates => $6', () => {
    const day = { ...BASE_DAY, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(dayCostUsd(day, PRICING.haiku)).toBeCloseTo(6, 4); // $1 + $5
  });

  it('cache read tokens use input * 0.1 rate (opus: $1.50/MTok)', () => {
    const day = { ...BASE_DAY, cacheReadTokens: 1_000_000 };
    expect(dayCostUsd(day, PRICING.opus)).toBeCloseTo(1.5, 4); // $15 * 0.1
  });

  it('cache write tokens use input * 1.25 rate (opus: $18.75/MTok)', () => {
    const day = { ...BASE_DAY, cacheWriteTokens: 1_000_000 };
    expect(dayCostUsd(day, PRICING.opus)).toBeCloseTo(18.75, 4); // $15 * 1.25
  });

  it('all zero tokens => $0 cost', () => {
    expect(dayCostUsd(BASE_DAY, PRICING.opus)).toBe(0);
  });

  it('sub-million token counts scale correctly (100k output at opus)', () => {
    const day = { ...BASE_DAY, outputTokens: 100_000 };
    expect(dayCostUsd(day, PRICING.opus)).toBeCloseTo(7.5, 4); // $75 / 10
  });

  it('all token types combined at sonnet', () => {
    const day = {
      ...BASE_DAY,
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 2_000_000,
      cacheWriteTokens: 200_000,
    };
    // $3 + $7.5 + $0.6 + $0.75 = $11.85
    const expected = 3 + 7.5 + 0.6 + 0.75;
    expect(dayCostUsd(day, PRICING.sonnet)).toBeCloseTo(expected, 4);
  });

  it('PRICING.opus has correct rates', () => {
    expect(PRICING.opus.input).toBe(15);
    expect(PRICING.opus.output).toBe(75);
  });

  it('PRICING.sonnet has correct rates', () => {
    expect(PRICING.sonnet.input).toBe(3);
    expect(PRICING.sonnet.output).toBe(15);
  });

  it('PRICING.haiku has correct rates', () => {
    expect(PRICING.haiku.input).toBe(1);
    expect(PRICING.haiku.output).toBe(5);
  });
});

describe('detectCostSpike', () => {
  const makeDays = (costs: number[]) =>
    costs.map((costUsd, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      costUsd,
    }));

  it('spike: latest 3x baseline => spike=true', () => {
    const days = makeDays([10, 10, 10, 10, 30]);
    const result = detectCostSpike(days);
    expect(result.spike).toBe(true);
    expect(result.ratio).toBeCloseTo(3, 1);
    expect(result.latestUsd).toBe(30);
    expect(result.baselineUsd).toBeCloseTo(10, 1);
  });

  it('no spike: latest within 1.5x baseline', () => {
    const days = makeDays([10, 10, 10, 14]);
    const result = detectCostSpike(days);
    expect(result.spike).toBe(false);
    expect(result.ratio).toBeLessThan(1.5);
  });

  it('insufficient data (2 days) => spike=false', () => {
    const days = makeDays([5, 10]);
    expect(detectCostSpike(days).spike).toBe(false);
  });

  it('insufficient data (1 day) => spike=false', () => {
    const days = makeDays([100]);
    expect(detectCostSpike(days).spike).toBe(false);
  });

  it('zero baseline => spike=false regardless of latest', () => {
    const days = makeDays([0, 0, 0, 100]);
    expect(detectCostSpike(days).spike).toBe(false);
  });

  it('exact 1.5x ratio is NOT a spike (must be strictly >)', () => {
    const days = makeDays([10, 10, 10, 15]);
    expect(detectCostSpike(days).spike).toBe(false);
  });

  it('just over 1.5x ratio IS a spike', () => {
    const days = makeDays([10, 10, 10, 15.1]);
    expect(detectCostSpike(days).spike).toBe(true);
  });

  it('prior days capped at 7 (uses up-to-7 days before latest)', () => {
    // 10 days of $10, then one day at $1000
    const days = makeDays([10, 10, 10, 10, 10, 10, 10, 10, 10, 200]);
    const result = detectCostSpike(days);
    // baseline = mean of prior 7 = $10; ratio = 200/10 = 20 => spike
    expect(result.spike).toBe(true);
    expect(result.baselineUsd).toBeCloseTo(10, 1);
  });

  it('returns latestUsd and baselineUsd in result', () => {
    const days = makeDays([20, 20, 20, 60]);
    const result = detectCostSpike(days);
    expect(result.latestUsd).toBe(60);
    expect(result.baselineUsd).toBeCloseTo(20, 1);
    expect(result.ratio).toBeCloseTo(3, 1);
  });

  it('minimum 3 days: exactly 3 days with a spike works', () => {
    const days = makeDays([10, 10, 30]);
    const result = detectCostSpike(days);
    // baseline = mean([10]) = 10; latest = 30; ratio = 3 > 1.5 => spike
    expect(result.spike).toBe(true);
  });
});
