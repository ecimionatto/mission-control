import React from 'react';
import { Panel, Badge, formatAgo, shortRepo } from './Panel';
import type { ApiResult, PullRequest } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<PullRequest[]> | null }

const CI_COLORS: Record<string, string> = {
  success: colors.ci.success,
  failure: colors.ci.failure,
  pending: colors.ci.pending,
  none: colors.ci.none,
  unknown: colors.ci.unknown,
};

const STATE_COLORS: Record<string, string> = {
  open: colors.data.blue,
  merged: colors.data.magenta,
  closed: colors.feedback.muted,
};

export function PRsPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const prs = result?.ok ? result.data : [];

  const open = prs.filter(p => p.state === 'open');
  const merged = prs.filter(p => p.state === 'merged');

  const badge = result?.ok ? (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      {open.length} open · {merged.length} merged
    </span>
  ) : undefined;

  return (
    <Panel title="Pull Requests" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {prs.length === 0 && !loading && !error && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 0' }}>No pull requests found.</div>
      )}
      {[...open, ...merged].slice(0, 25).map(pr => (
        <PRRow key={`${pr.repo}-${pr.number}`} pr={pr} />
      ))}
    </Panel>
  );
}

function PRRow({ pr }: { pr: PullRequest }) {
  return (
    <div className="pr-row" style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 60px 70px',
      gap: 8,
      alignItems: 'center',
      padding: '5px 0',
      borderBottom: '1px solid var(--border-dim)',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <Badge label={shortRepo(pr.repo)} color={STATE_COLORS[pr.state] ?? colors.feedback.muted} />
      </div>
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          style={{ color: pr.state === 'merged' ? 'var(--text-secondary)' : 'var(--text-primary)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
          title={pr.title}
        >
          {pr.isDraft && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>[draft]</span>}
          #{pr.number} {pr.title}
        </a>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pr.author}</span>
      </div>
      <div>
        <Badge
          label={pr.ciStatus}
          color={CI_COLORS[pr.ciStatus] ?? colors.feedback.muted}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {formatAgo(pr.updatedAt)}
      </div>
    </div>
  );
}
