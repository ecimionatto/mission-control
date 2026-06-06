import React from 'react';
import { Panel, Badge, formatAgo, fmtDuration, shortRepo } from './Panel';
import type { ApiResult, WorkflowRun } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<WorkflowRun[]> | null }

function conclusionColor(run: WorkflowRun): string {
  const key = run.conclusion ?? run.status;
  if (key === 'success') return colors.ci.success;
  if (key === 'failure' || key === 'timed_out' || key === 'startup_failure') return colors.ci.failure;
  if (key === 'cancelled' || key === 'skipped') return colors.ci.cancelled;
  if (key === 'in_progress' || key === 'queued' || key === 'waiting') return colors.ci.pending;
  return colors.ci.unknown;
}

function conclusionLabel(run: WorkflowRun): string {
  if (run.status === 'in_progress') return 'running';
  if (run.status === 'queued') return 'queued';
  return run.conclusion ?? run.status ?? '?';
}

export function WorkflowsPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const runs = result?.ok ? result.data : [];

  const badge = result?.ok ? (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      {runs.filter(r => r.status === 'in_progress').length} running · {runs.length} total
    </span>
  ) : undefined;

  return (
    <Panel title="Workflows" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {runs.length === 0 && !loading && !error && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No recent runs.</div>
      )}
      {runs.slice(0, 20).map(run => (
        <RunRow key={`${run.repo}-${run.id}`} run={run} />
      ))}
    </Panel>
  );
}

function RunRow({ run }: { run: WorkflowRun }) {
  const color = conclusionColor(run);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 80px 60px 70px',
      gap: 8,
      alignItems: 'center',
      padding: '5px 0',
      borderBottom: '1px solid var(--border-dim)',
      fontSize: 12,
    }}>
      <Badge label={shortRepo(run.repo)} color={colors.data.blue} />
      <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={run.workflowName}>
        {run.workflowName}
      </span>
      <Badge label={conclusionLabel(run)} color={color} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        {fmtDuration(run.durationSeconds)}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {formatAgo(run.startedAt)}
      </span>
    </div>
  );
}
