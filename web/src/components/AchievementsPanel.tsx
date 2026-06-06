import React from 'react';
import { Panel, Badge } from './Panel';
import type { ApiResult, AchievementsData } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<AchievementsData> | null }

export function AchievementsPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;

  return (
    <Panel title="Achievements" fetchedAt={result?.fetchedAt} error={error} loading={loading}>
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.items.length > 0 && (
            <section>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Merged PRs
              </div>
              {data.items.slice(0, 12).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid var(--border-dim)', fontSize: 12 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 1 }}>{item.date}</span>
                  <div style={{ minWidth: 0 }}>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }} title={item.title}>
                        {item.title}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                    )}
                    {item.repo && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {item.repo.split('/')[1]}
                        {item.author && ` · ${item.author}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {data.recentReports.length > 0 && (
            <section>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Research Reports
              </div>
              {data.recentReports.slice(0, 8).map((report, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-dim)', fontSize: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 1 }}>{report.date}</span>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>{report.name}</span>
                      {report.theme && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{report.theme}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {data.items.length === 0 && data.recentReports.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No achievements found.</div>
          )}
        </div>
      )}
    </Panel>
  );
}
