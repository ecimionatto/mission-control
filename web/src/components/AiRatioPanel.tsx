import React from 'react';
import { Panel, Row } from './Panel';
import type { ApiResult, AiRatioData, RepoRatio } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<AiRatioData> | null }

function ratioColor(ratio: number): string {
  if (ratio >= 0.5) return colors.data.blue;
  if (ratio >= 0.2) return colors.data.amber;
  return colors.feedback.muted;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function RatioBar({ ratio }: { ratio: number }) {
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: pct(ratio), background: ratioColor(ratio), borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function RepoRow({ repo }: { repo: RepoRatio }) {
  return (
    <Row style={{ gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 120, fontFamily: 'monospace' }}>
        {repo.repo}
      </span>
      <RatioBar ratio={repo.ratio} />
      <span style={{ fontSize: 11, color: ratioColor(repo.ratio), minWidth: 32, textAlign: 'right', fontWeight: 600 }}>
        {pct(repo.ratio)}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {repo.aiAuthored}/{repo.total}
      </span>
    </Row>
  );
}

export function AiRatioPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : null;

  const badge = data ? (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      last {data.windowDays}d
    </span>
  ) : undefined;

  return (
    <Panel title="AI Authorship" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: ratioColor(data.overall.ratio), lineHeight: 1 }}>
              {pct(data.overall.ratio)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              overall · {data.overall.aiAuthored}/{data.overall.total} commits
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
            Floor metric — Co-Authored-By trailer detection undercounts by ~15–20%
          </div>
          {data.repos.map(repo => (
            <RepoRow key={repo.repo} repo={repo} />
          ))}
          {data.repos.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No repos found.</div>
          )}
        </>
      )}
    </Panel>
  );
}
