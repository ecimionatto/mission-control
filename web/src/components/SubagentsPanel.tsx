import React, { useState } from 'react';
import { Panel, formatAgo } from './Panel';
import type { ApiResult, SubagentsData, WorkerLog, FleetTracingData, TracedWorker, WorkerStatus } from '../api';

interface Props {
  result: ApiResult<SubagentsData> | null;
  fleetTracing: ApiResult<FleetTracingData> | null;
}

const STATUS_COLOR: Record<WorkerStatus, string> = {
  stuck: '#e53935',
  idle: '#f59e0b',
  active: '#22c55e',
};

export function SubagentsPanel({ result, fleetTracing }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;
  const tracing = fleetTracing?.ok ? fleetTracing.data : undefined;

  const stuckCount = tracing?.stuckCount ?? 0;
  const badge = data ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      {data.workers.length} log{data.workers.length !== 1 ? 's' : ''}
      {stuckCount > 0 && (
        <span style={{
          background: '#e53935',
          color: '#fff',
          borderRadius: 10,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 700,
        }}>
          {stuckCount} stuck
        </span>
      )}
    </span>
  ) : undefined;

  return (
    <Panel title="Subagents / Workers" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && (
        <div>
          {data.workers.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{data.note}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {data.workers.map((w, i) => {
              const traced = tracing?.workers.find(t => t.name === w.name);
              return <WorkerCard key={i} worker={w} traced={traced} />;
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function WorkerCard({ worker, traced }: { worker: WorkerLog; traced?: TracedWorker }) {
  const [expanded, setExpanded] = useState(false);
  const status = traced?.status;
  const retryCount = traced?.retryCount;

  return (
    <div style={{
      background: 'var(--bg-card-alt)',
      border: `1px solid ${status === 'stuck' ? '#e53935' : status === 'idle' ? '#f59e0b33' : 'var(--border-dim)'}`,
      borderRadius: 4,
      padding: '8px 10px',
      fontSize: 11,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {status && (
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: STATUS_COLOR[status],
              flexShrink: 0,
              display: 'inline-block',
            }} title={traced?.reason} />
          )}
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{worker.name}</span>
          {status === 'stuck' && retryCount !== undefined && (
            <span style={{
              background: '#e5393522',
              color: '#e53935',
              borderRadius: 4,
              padding: '0 5px',
              fontSize: 9,
              fontWeight: 700,
            }}>
              ×{retryCount}
            </span>
          )}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {formatAgo(worker.modifiedAt)} · {(worker.sizeBytes / 1024).toFixed(1)}KB
        </span>
      </div>
      <div
        style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.6 }}
        onClick={() => setExpanded(e => !e)}
        title="Click to expand"
      >
        {(expanded ? worker.lastLines : worker.lastLines.slice(-3)).map((line, i) => (
          <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>
        ))}
        {!expanded && worker.lastLines.length > 3 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>…{worker.lastLines.length - 3} more lines</div>
        )}
      </div>
    </div>
  );
}
