import { describe, it, expect } from 'vitest';
import { extractThemeFromReport, parseDateFromReportFilename } from '../modules/achievements';

describe('parseDateFromReportFilename', () => {
  it('extracts ISO date from plain filename', () => {
    expect(parseDateFromReportFilename('2026-06-05.md')).toBe('2026-06-05');
  });

  it('extracts ISO date from prefixed filename', () => {
    expect(parseDateFromReportFilename('crescendo-2026-05-19.md')).toBe('2026-05-19');
  });

  it('returns filename without extension when no date pattern', () => {
    expect(parseDateFromReportFilename('readme.md')).toBe('readme');
  });
});

describe('extractThemeFromReport', () => {
  it('extracts theme from **Theme:** line', () => {
    const content = `# DTrain Research Report — 2026-06-05\n\n**Theme:** on-device-coaching-prompts: Grammar-constrained tool calling\n\n## Why it matters\nFoo bar.`;
    expect(extractThemeFromReport(content)).toBe('on-device-coaching-prompts: Grammar-constrained tool calling');
  });

  it('extracts theme from **Theme**: (no trailing colon space variation)', () => {
    const content = `# Report\n**Theme**: Some great theme here**\n\n## Section`;
    const result = extractThemeFromReport(content);
    expect(result).toContain('Some great theme here');
  });

  it('falls back to first h2 heading when no Theme line', () => {
    const content = `# Report Title\n\n## Why it matters\nSomething important.`;
    expect(extractThemeFromReport(content)).toBe('Why it matters');
  });

  it('returns undefined for empty content', () => {
    expect(extractThemeFromReport('')).toBeUndefined();
  });

  it('strips trailing asterisks from theme value', () => {
    const content = `**Theme:** test topic**\n`;
    const result = extractThemeFromReport(content);
    expect(result).toBe('test topic');
  });
});
