import { describe, it, expect, afterEach, vi } from 'vitest';
import { estimateCostFromRuns, resolveGithubBillingOwner } from '../modules/githubCost';
import type { WorkflowRun } from '../types';

function makeRun(durationSeconds: number | null): WorkflowRun {
  return {
    id: 1,
    name: 'Test',
    workflowName: 'CI',
    status: 'completed',
    conclusion: 'success',
    startedAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:05:00Z',
    durationSeconds,
    repo: 'ecimionatto/test',
    event: 'push',
  };
}

describe('estimateCostFromRuns', () => {
  it('returns zero for empty list', () => {
    const result = estimateCostFromRuns([]);
    expect(result.estimatedUsdCost).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });

  it('sums durations and applies cost rate', () => {
    // 2 runs × 60s each = 120s = 2 min × $0.008 = $0.016
    const result = estimateCostFromRuns([makeRun(60), makeRun(60)]);
    expect(result.totalMinutes).toBe(2);
    expect(result.estimatedUsdCost).toBe(0.02); // rounded to cents
  });

  it('ignores runs with null duration', () => {
    const result = estimateCostFromRuns([makeRun(null), makeRun(600)]);
    expect(result.totalMinutes).toBe(10);
  });

  it('ignores runs with zero or negative duration', () => {
    const result = estimateCostFromRuns([makeRun(0), makeRun(-10), makeRun(120)]);
    expect(result.totalMinutes).toBe(2);
  });

  it('rounds cost to 2 decimal places', () => {
    // 1 run × 7s ≈ 0.117 min × $0.008 = $0.000933 → rounds to $0
    const result = estimateCostFromRuns([makeRun(7)]);
    expect(result.estimatedUsdCost).toBe(0);
  });
});

describe('resolveGithubBillingOwner', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns GH_BILLING_OWNER when set (no shell call)', async () => {
    vi.stubEnv('GH_BILLING_OWNER', 'myorg');
    delete process.env.REPOS;
    const mockShell = vi.fn();
    const owner = await resolveGithubBillingOwner(mockShell as never);
    expect(owner).toBe('myorg');
    expect(mockShell).not.toHaveBeenCalled();
  });

  it('derives owner from first REPOS entry when GH_BILLING_OWNER is unset', async () => {
    delete process.env.GH_BILLING_OWNER;
    vi.stubEnv('REPOS', 'myorg/repo1,otherorg/repo2');
    const mockShell = vi.fn();
    const owner = await resolveGithubBillingOwner(mockShell as never);
    expect(owner).toBe('myorg');
    expect(mockShell).not.toHaveBeenCalled();
  });

  it('falls back to gh api user login when both envs are unset', async () => {
    delete process.env.GH_BILLING_OWNER;
    delete process.env.REPOS;
    const mockShell = vi.fn().mockResolvedValue({ ok: true, data: { login: 'ghuser' } });
    const owner = await resolveGithubBillingOwner(mockShell as never);
    expect(owner).toBe('ghuser');
    expect(mockShell).toHaveBeenCalledWith('gh', ['api', 'user'], 10_000);
  });

  it('returns null when all methods fail', async () => {
    delete process.env.GH_BILLING_OWNER;
    delete process.env.REPOS;
    const mockShell = vi.fn().mockResolvedValue({ ok: false, error: 'no auth' });
    const owner = await resolveGithubBillingOwner(mockShell as never);
    expect(owner).toBeNull();
  });
});
