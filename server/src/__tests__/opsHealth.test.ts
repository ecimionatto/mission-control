import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, default: { ...actual, readFileSync: vi.fn() } };
});

import fs from 'fs';
import { fetchOpsHealth } from '../modules/opsHealth';

const VALID_JSON = JSON.stringify({
  generatedAt: '2026-06-19T10:00:00Z',
  security: {
    dependabotAlerts: {
      'daily-train-app': { critical: 2, high: 1, moderate: 0, low: 3 },
      'crescendo-app': { critical: 0, high: 0, moderate: 1, low: 0 },
    },
    npmAudit: {
      'daily-train-app': { critical: 1, high: 0, moderate: 0, low: 0 },
      'crescendo-app': { critical: 0, high: 0, moderate: 0, low: 0 },
    },
  },
  pipelines: {
    last24hFailures: [
      {
        repo: 'ecimionatto/daily-train-app',
        workflowName: 'CI',
        conclusion: 'failure',
        createdAt: '2026-06-19T08:00:00Z',
        url: 'https://github.com/ecimionatto/daily-train-app/actions/runs/1',
      },
    ],
    last24hFailureCount: 1,
  },
  crashes: {
    'daily-train-app': { last7dCount: null, note: 'ASC creds not configured locally' },
    'crescendo-app': { last7dCount: null, note: 'ASC creds not configured locally' },
  },
  techDebt: {
    'daily-train-app': { openIssues: 2, items: [{ number: 5, title: 'Refactor auth', url: 'https://github.com/ecimionatto/daily-train-app/issues/5' }] },
    'crescendo-app': { openIssues: 0, items: [] },
  },
  actionable: [
    { severity: 'critical', type: 'security', repo: 'daily-train-app', summary: 'Dependabot: 2 CRITICAL vulnerabilities' },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('fetchOpsHealth', () => {
  it('returns ok result with parsed data when file is valid', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_JSON);
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.generatedAt).toBe('2026-06-19T10:00:00Z');
  });

  it('returns err result when file is missing', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const e = new Error('no such file') as NodeJS.ErrnoException;
      e.code = 'ENOENT';
      throw e;
    });
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found|ENOENT|no such file/i);
  });

  it('returns err result when JSON is malformed', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json :::');
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/parse|JSON|invalid/i);
  });

  it('maps security alert counts correctly', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_JSON);
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dtrain = result.data.security.dependabotAlerts['daily-train-app'];
    expect(dtrain.critical).toBe(2);
    expect(dtrain.high).toBe(1);
    expect(dtrain.low).toBe(3);
    const npm = result.data.security.npmAudit['daily-train-app'];
    expect(npm.critical).toBe(1);
  });

  it('maps pipeline failure list correctly', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_JSON);
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines.last24hFailureCount).toBe(1);
    expect(result.data.pipelines.last24hFailures).toHaveLength(1);
    const failure = result.data.pipelines.last24hFailures[0];
    expect(failure.workflowName).toBe('CI');
    expect(failure.conclusion).toBe('failure');
    expect(failure.repo).toBe('ecimionatto/daily-train-app');
  });

  it('maps tech debt items correctly', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_JSON);
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.techDebt['daily-train-app'].openIssues).toBe(2);
    expect(result.data.techDebt['daily-train-app'].items[0].title).toBe('Refactor auth');
    expect(result.data.techDebt['crescendo-app'].openIssues).toBe(0);
  });

  it('maps actionable items correctly', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_JSON);
    const result = await fetchOpsHealth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.actionable).toHaveLength(1);
    expect(result.data.actionable[0].severity).toBe('critical');
    expect(result.data.actionable[0].type).toBe('security');
  });

  it('fetchedAt is a valid ISO timestamp', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_JSON);
    const result = await fetchOpsHealth();
    expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
  });
});
