import { describe, it, expect } from 'vitest';
import { parseReport } from '../modules/research';

const DTRAIN_CONTENT = `\u{1F99E} *DTrain Daily — swim-bike-run-tech*
*Theme:* on-device coaching prompts
*Why it matters* Athletes need real-time feedback during workouts. *Findings* • Grammar-constrained tool calling improves response quality • On-device models reduce latency by 40% • Structured outputs enable better coach-athlete interaction`;

const CRESCENDO_CONTENT = `\u{1F3B5} *Crescendo Daily — structured workout music*
*Theme:* BPM-sync with workout intensity

## Why it matters
Music tempo directly affects performance and effort perception.

## Findings
- BPM matching increases power output by 8%
- Adaptive playlists reduce workout dropout
- Real-time sync improves user satisfaction scores`;

const MALFORMED_CONTENT = `This is a report with no clear structure or markers of any kind at all just random text`;

describe('parseReport', () => {
  describe('source detection', () => {
    it('detects DTrain from first line', () => {
      expect(parseReport('2026-06-04.md', DTRAIN_CONTENT).source).toBe('DTrain');
    });

    it('detects Crescendo from first line', () => {
      expect(parseReport('crescendo-2026-06-02.md', CRESCENDO_CONTENT).source).toBe('Crescendo');
    });

    it('detects Crescendo from filename when content is ambiguous', () => {
      const plain = `*Theme:* something\n*Findings* • item`;
      expect(parseReport('crescendo-2026-06-01.md', plain).source).toBe('Crescendo');
    });

    it('returns "other" for unrecognized source', () => {
      expect(parseReport('unknown-report.md', MALFORMED_CONTENT).source).toBe('other');
    });
  });

  describe('date parsing', () => {
    it('parses date from plain filename', () => {
      expect(parseReport('2026-06-04.md', DTRAIN_CONTENT).date).toBe('2026-06-04');
    });

    it('parses date from prefixed filename', () => {
      expect(parseReport('crescendo-2026-06-02.md', CRESCENDO_CONTENT).date).toBe('2026-06-02');
    });

    it('uses filename stem when no date pattern', () => {
      const report = parseReport('unknown-report.md', MALFORMED_CONTENT);
      expect(report.date).toBe('unknown-report');
    });
  });

  describe('theme parsing', () => {
    it('extracts theme from *Theme:* line', () => {
      expect(parseReport('2026-06-04.md', DTRAIN_CONTENT).theme).toBe('on-device coaching prompts');
    });

    it('extracts theme from Crescendo content', () => {
      expect(parseReport('crescendo-2026-06-02.md', CRESCENDO_CONTENT).theme).toBe('BPM-sync with workout intensity');
    });

    it('returns empty string for malformed content', () => {
      expect(parseReport('unknown.md', MALFORMED_CONTENT).theme).toBe('');
    });
  });

  describe('findings parsing', () => {
    it('extracts bullet findings from DTrain format', () => {
      const report = parseReport('2026-06-04.md', DTRAIN_CONTENT);
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.findings.length).toBeLessThanOrEqual(3);
      expect(report.findings[0]).toContain('Grammar-constrained');
    });

    it('extracts list findings from Crescendo format', () => {
      const report = parseReport('crescendo-2026-06-02.md', CRESCENDO_CONTENT);
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.findings[0]).toContain('BPM matching');
    });

    it('returns empty array for malformed content gracefully', () => {
      const report = parseReport('unknown.md', MALFORMED_CONTENT);
      expect(Array.isArray(report.findings)).toBe(true);
    });
  });

  describe('resilience', () => {
    it('handles empty content without throwing', () => {
      expect(() => parseReport('empty.md', '')).not.toThrow();
    });

    it('handles content with only title line', () => {
      const report = parseReport('2026-01-01.md', '*DTrain Daily*');
      expect(report).toBeDefined();
      expect(report.source).toBe('DTrain');
    });
  });
});
