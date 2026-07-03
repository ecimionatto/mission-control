import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseGitLog, isAiAuthored, computeAiRatio, getLocalRepos } from '../modules/aiRatio';

describe('parseGitLog', () => {
  it('returns empty array for empty stdout', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('returns empty array for whitespace-only stdout', () => {
    expect(parseGitLog('  \n  ')).toEqual([]);
  });

  it('parses a single commit', () => {
    const stdout = 'abc123\x1fuser@example.com\x1ffeat: add thing\n\x1e';
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe('abc123');
    expect(commits[0].authorEmail).toBe('user@example.com');
    expect(commits[0].body).toBe('feat: add thing');
  });

  it('parses multiple commits', () => {
    const parts = [
      'abc123\x1fuser@example.com\x1ffeat: first\n',
      'def456\x1fother@example.com\x1ffeat: second\n',
    ];
    const stdout = parts.join('\x1e') + '\x1e';
    const commits = parseGitLog(stdout);
    expect(commits).toHaveLength(2);
    expect(commits[0].hash).toBe('abc123');
    expect(commits[1].hash).toBe('def456');
    expect(commits[1].authorEmail).toBe('other@example.com');
  });

  it('preserves Co-Authored-By trailer in body', () => {
    const body = 'feat: add thing\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>\n';
    const stdout = `abc123\x1fuser@example.com\x1f${body}\x1e`;
    const commits = parseGitLog(stdout);
    expect(commits[0].body).toContain('Co-Authored-By');
    expect(commits[0].body).toContain('noreply@anthropic.com');
  });

  it('skips records without a hash', () => {
    const stdout = '\x1e\x1e';
    expect(parseGitLog(stdout)).toHaveLength(0);
  });
});

describe('isAiAuthored', () => {
  it('returns true when Co-Authored-By trailer has anthropic email', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'user@example.com',
      body: 'feat: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    })).toBe(true);
  });

  it('returns true when author email is the bot noreply address', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'noreply@anthropic.com',
      body: 'feat: thing',
    })).toBe(true);
  });

  it('returns true when a Co-Authored-By trailer is a GitHub App [bot]', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'user@example.com',
      body: 'feat: thing\n\nCo-Authored-By: Louis Agent <12345+louis-agent[bot]@users.noreply.github.com>\n',
    })).toBe(true);
  });

  it('returns true when author email is a GitHub App [bot]', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'github-actions[bot]@users.noreply.github.com',
      body: 'chore: auto-update',
    })).toBe(true);
  });

  it('does NOT false-positive on human emails containing "claude"/"bot" substrings', () => {
    // claudia@, talbot@, abbott@ are real human addresses — must not match.
    for (const email of ['claudia@example.com', 'talbot@example.com', 'abbott@example.com']) {
      expect(isAiAuthored({ hash: 'abc', authorEmail: email, body: 'feat: x' })).toBe(false);
    }
  });

  it('does NOT false-positive when "claude" appears only in prose', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'edson@example.com',
      body: 'fix: correct the claude integration prompt wording',
    })).toBe(false);
  });

  it('returns false for plain human commit with no trailers', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'edson@example.com',
      body: 'feat: add feature\n\nSome description.',
    })).toBe(false);
  });

  it('returns false when Co-Authored-By trailer is a human', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'edson@example.com',
      body: 'feat: thing\n\nCo-Authored-By: Alice <alice@example.com>\n',
    })).toBe(false);
  });

  it('is case-insensitive for bot email detection', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'user@example.com',
      body: 'feat: thing\n\nCo-Authored-By: Claude <NOREPLY@ANTHROPIC.COM>\n',
    })).toBe(true);
  });

  it('matches full Co-Authored-By line with name and angle-bracket email', () => {
    expect(isAiAuthored({
      hash: 'abc',
      authorEmail: 'human@example.com',
      body: 'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
    })).toBe(true);
  });
});

describe('computeAiRatio', () => {
  it('returns zero counts and ratio 0 for empty commits', () => {
    expect(computeAiRatio([])).toEqual({ total: 0, aiAuthored: 0, ratio: 0 });
  });

  it('returns ratio 1 when all commits are AI-authored', () => {
    const commits = [
      { hash: 'a', authorEmail: 'noreply@anthropic.com', body: '' },
      { hash: 'b', authorEmail: 'noreply@anthropic.com', body: '' },
    ];
    expect(computeAiRatio(commits)).toEqual({ total: 2, aiAuthored: 2, ratio: 1 });
  });

  it('computes ratio correctly for mixed commits', () => {
    const commits = [
      { hash: 'a', authorEmail: 'noreply@anthropic.com', body: '' },
      { hash: 'b', authorEmail: 'human@example.com', body: '' },
      { hash: 'c', authorEmail: 'human@example.com', body: '' },
      { hash: 'd', authorEmail: 'human@example.com', body: 'Co-Authored-By: Claude <noreply@anthropic.com>' },
    ];
    const result = computeAiRatio(commits);
    expect(result.total).toBe(4);
    expect(result.aiAuthored).toBe(2);
    expect(result.ratio).toBe(0.5);
  });

  it('counts trailer-authored commits as AI-authored', () => {
    const commits = [
      { hash: 'a', authorEmail: 'human@example.com', body: 'feat: thing\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>\n' },
      { hash: 'b', authorEmail: 'human@example.com', body: 'fix: bug' },
    ];
    const result = computeAiRatio(commits);
    expect(result.aiAuthored).toBe(1);
    expect(result.total).toBe(2);
    expect(result.ratio).toBe(0.5);
  });

  it('handles single AI commit', () => {
    const commits = [{ hash: 'a', authorEmail: 'noreply@anthropic.com', body: '' }];
    expect(computeAiRatio(commits)).toEqual({ total: 1, aiAuthored: 1, ratio: 1 });
  });

  it('handles single human commit', () => {
    const commits = [{ hash: 'a', authorEmail: 'human@example.com', body: 'fix: typo' }];
    expect(computeAiRatio(commits)).toEqual({ total: 1, aiAuthored: 0, ratio: 0 });
  });
});

describe('getLocalRepos', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns parsed paths when MC_LOCAL_REPOS is set to two paths', () => {
    vi.stubEnv('MC_LOCAL_REPOS', '/home/user/repo1,/home/user/repo2');
    expect(getLocalRepos()).toEqual(['/home/user/repo1', '/home/user/repo2']);
  });

  it('returns empty array when MC_LOCAL_REPOS is not set', () => {
    delete process.env.MC_LOCAL_REPOS;
    expect(getLocalRepos()).toEqual([]);
  });

  it('trims whitespace from paths', () => {
    vi.stubEnv('MC_LOCAL_REPOS', '  /home/user/repo1  ,  /home/user/repo2  ');
    expect(getLocalRepos()).toEqual(['/home/user/repo1', '/home/user/repo2']);
  });

  it('returns empty array when MC_LOCAL_REPOS is empty string', () => {
    vi.stubEnv('MC_LOCAL_REPOS', '');
    expect(getLocalRepos()).toEqual([]);
  });

  it('filters out blank entries from paths with consecutive commas', () => {
    vi.stubEnv('MC_LOCAL_REPOS', '/home/user/repo1,,/home/user/repo2');
    expect(getLocalRepos()).toEqual(['/home/user/repo1', '/home/user/repo2']);
  });
});
