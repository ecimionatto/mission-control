export interface ServerConfig {
  repos: string[];
}

export function getServerConfig(): ServerConfig {
  const raw = process.env.REPOS?.trim() ?? '';
  const repos = raw
    ? raw.split(',').map(r => r.trim()).filter(Boolean).map(r => {
        const parts = r.split('/');
        return parts[parts.length - 1] ?? r;
      })
    : [];
  return { repos };
}
