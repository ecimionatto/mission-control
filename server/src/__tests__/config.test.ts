import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { getServerConfig } from '../modules/config';

describe('getServerConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns short repo names (last segment of owner/repo) when REPOS is set', () => {
    vi.stubEnv('REPOS', 'myorg/api,myorg/mobile');
    const config = getServerConfig();
    expect(config.repos).toEqual(['api', 'mobile']);
  });

  it('returns empty array when REPOS is unset', () => {
    delete process.env.REPOS;
    const config = getServerConfig();
    expect(config.repos).toEqual([]);
  });

  it('trims whitespace in entries', () => {
    vi.stubEnv('REPOS', '  myorg/api  ,  myorg/mobile  ');
    const config = getServerConfig();
    expect(config.repos).toEqual(['api', 'mobile']);
  });

  it('handles repos without a slash gracefully', () => {
    vi.stubEnv('REPOS', 'myrepo,myorg/other');
    const config = getServerConfig();
    expect(config.repos).toEqual(['myrepo', 'other']);
  });
});
