import { describe, it, expect } from 'vitest';
import { deriveCiStatus, transformPR } from '../modules/githubPRs';
import { transformWorkflowRun } from '../modules/githubWorkflows';

describe('deriveCiStatus', () => {
  it('returns none for empty checks', () => {
    expect(deriveCiStatus([])).toBe('none');
  });

  it('returns success when all checks are SUCCESS', () => {
    expect(deriveCiStatus([{ state: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('success');
  });

  it('returns failure when any check is FAILURE', () => {
    expect(deriveCiStatus([{ state: 'SUCCESS' }, { state: 'FAILURE' }])).toBe('failure');
  });

  it('returns pending when any check is IN_PROGRESS', () => {
    expect(deriveCiStatus([{ state: 'SUCCESS' }, { status: 'IN_PROGRESS' }])).toBe('pending');
  });

  it('returns pending for QUEUED status', () => {
    expect(deriveCiStatus([{ status: 'QUEUED' }])).toBe('pending');
  });

  it('uses conclusion field when state is absent', () => {
    expect(deriveCiStatus([{ conclusion: 'failure' }])).toBe('failure');
  });

  it('returns failure for TIMED_OUT conclusion', () => {
    expect(deriveCiStatus([{ conclusion: 'TIMED_OUT' }])).toBe('failure');
  });
});

describe('transformPR', () => {
  const raw = {
    number: 42,
    title: 'feat: add new feature',
    state: 'OPEN',
    isDraft: false,
    author: { login: 'edson' },
    updatedAt: '2026-06-01T12:00:00Z',
    url: 'https://github.com/ecimionatto/test/pull/42',
    statusCheckRollup: [{ state: 'SUCCESS' }],
  };

  it('maps all fields correctly', () => {
    const pr = transformPR(raw, 'ecimionatto/test');
    expect(pr.number).toBe(42);
    expect(pr.title).toBe('feat: add new feature');
    expect(pr.state).toBe('open');
    expect(pr.repo).toBe('ecimionatto/test');
    expect(pr.author).toBe('edson');
    expect(pr.ciStatus).toBe('success');
    expect(pr.isDraft).toBe(false);
    expect(pr.url).toBe('https://github.com/ecimionatto/test/pull/42');
  });

  it('handles null author gracefully', () => {
    const pr = transformPR({ ...raw, author: null }, 'ecimionatto/test');
    expect(pr.author).toBe('unknown');
  });

  it('handles null statusCheckRollup', () => {
    const pr = transformPR({ ...raw, statusCheckRollup: null }, 'ecimionatto/test');
    expect(pr.ciStatus).toBe('none');
  });
});

describe('transformWorkflowRun', () => {
  const raw = {
    databaseId: 999,
    name: 'test run',
    workflowName: 'CI',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:05:00Z',
    event: 'push',
  };

  it('computes duration correctly', () => {
    const run = transformWorkflowRun(raw, 'ecimionatto/test');
    expect(run.durationSeconds).toBe(300); // 5 minutes
  });

  it('lowercases status and conclusion', () => {
    const run = transformWorkflowRun(raw, 'ecimionatto/test');
    expect(run.status).toBe('completed');
    expect(run.conclusion).toBe('success');
  });

  it('sets conclusion to null when missing', () => {
    const run = transformWorkflowRun({ ...raw, conclusion: null }, 'ecimionatto/test');
    expect(run.conclusion).toBeNull();
  });

  it('sets durationSeconds null for invalid dates', () => {
    const run = transformWorkflowRun({ ...raw, createdAt: '', updatedAt: '' }, 'ecimionatto/test');
    expect(run.durationSeconds).toBeNull();
  });
});
