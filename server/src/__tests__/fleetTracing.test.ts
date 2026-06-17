import { describe, it, expect } from 'vitest';
import { detectStuck, STALE_MS } from '../modules/fleetTracing';

const NOW = 1_750_000_000_000;
const RECENT_ISO = new Date(NOW - 60_000).toISOString();       // 1 min ago — fresh
const STALE_ISO = new Date(NOW - 20 * 60_000).toISOString();  // 20 min ago — stale

describe('detectStuck', () => {
  it('same line repeated 5x => stuck, retryCount 5', () => {
    const lines = [
      'Calling tool: Bash',
      'Calling tool: Bash',
      'Calling tool: Bash',
      'Calling tool: Bash',
      'Calling tool: Bash',
    ];
    const result = detectStuck(lines, RECENT_ISO, NOW);
    expect(result.status).toBe('stuck');
    expect(result.retryCount).toBe(5);
  });

  it('same line repeated 4x among mixed lines => stuck, retryCount 4', () => {
    const lines = [
      'Running npm test',
      'Running npm test',
      'Running npm test',
      'Running npm test',
      'Some other line',
    ];
    const result = detectStuck(lines, RECENT_ISO, NOW);
    expect(result.status).toBe('stuck');
    expect(result.retryCount).toBe(4);
  });

  it('exact boundary: retryCount 4 => stuck', () => {
    const lines = ['Tool: Read', 'Tool: Read', 'Tool: Read', 'Tool: Read'];
    const result = detectStuck(lines, RECENT_ISO, NOW);
    expect(result.status).toBe('stuck');
    expect(result.retryCount).toBe(4);
  });

  it('boundary: retryCount 3 => NOT stuck', () => {
    const lines = ['Tool: Read', 'Tool: Read', 'Tool: Read', 'Tool: Write'];
    const result = detectStuck(lines, RECENT_ISO, NOW);
    expect(result.status).not.toBe('stuck');
    expect(result.retryCount).toBe(3);
  });

  it('comb pattern overrides stale mtime — stuck takes priority', () => {
    const lines = ['npm run test', 'npm run test', 'npm run test', 'npm run test', 'npm run test'];
    const result = detectStuck(lines, STALE_ISO, NOW);
    expect(result.status).toBe('stuck');
  });

  it('stale mtime + varied lines => idle', () => {
    const lines = ['Reading src/index.ts', 'Writing response', 'Tool: Edit'];
    const result = detectStuck(lines, STALE_ISO, NOW);
    expect(result.status).toBe('idle');
    expect(result.retryCount).toBeLessThanOrEqual(1);
  });

  it('fresh mtime + fully varied lines => active', () => {
    const lines = [
      'Reading file src/index.ts',
      'Tool call: Bash',
      'Tool call: Read',
      'Thinking...',
      'Writing response',
    ];
    const result = detectStuck(lines, RECENT_ISO, NOW);
    expect(result.status).toBe('active');
  });

  it('empty lastLines + stale mtime => idle', () => {
    const result = detectStuck([], STALE_ISO, NOW);
    expect(result.status).toBe('idle');
    expect(result.retryCount).toBe(0);
  });

  it('empty lastLines + recent mtime => active', () => {
    const result = detectStuck([], RECENT_ISO, NOW);
    expect(result.status).toBe('active');
    expect(result.retryCount).toBe(0);
  });

  it('whitespace-trimmed lines treated as equal', () => {
    const lines = ['  Calling Read  ', 'Calling Read', '  Calling Read  ', 'Calling Read', 'Calling Read'];
    const result = detectStuck(lines, RECENT_ISO, NOW);
    expect(result.status).toBe('stuck');
    expect(result.retryCount).toBe(5);
  });

  it('reason field is a non-empty string for all statuses', () => {
    const stuck = detectStuck(
      ['Tool: Bash', 'Tool: Bash', 'Tool: Bash', 'Tool: Bash'],
      RECENT_ISO, NOW
    );
    expect(stuck.reason.length).toBeGreaterThan(0);

    const idle = detectStuck(['Reading file'], STALE_ISO, NOW);
    expect(idle.reason.length).toBeGreaterThan(0);

    const active = detectStuck(['Reading file'], RECENT_ISO, NOW);
    expect(active.reason.length).toBeGreaterThan(0);
  });

  it('STALE_MS is 15 minutes in milliseconds', () => {
    expect(STALE_MS).toBe(15 * 60 * 1_000);
  });

  it('log just under STALE_MS => active', () => {
    const justFresh = new Date(NOW - STALE_MS + 1_000).toISOString();
    const result = detectStuck(['Doing work'], justFresh, NOW);
    expect(result.status).toBe('active');
  });

  it('log just over STALE_MS => idle', () => {
    const justStale = new Date(NOW - STALE_MS - 1_000).toISOString();
    const result = detectStuck(['Doing work'], justStale, NOW);
    expect(result.status).toBe('idle');
  });
});
