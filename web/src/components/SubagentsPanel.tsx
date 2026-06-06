import React, { useState } from 'react';
import { Panel, formatAgo } from './Panel';
import type { ApiResult, SubagentsData, WorkerLog } from '../api';

interface Props { result: ApiResult<SubagentsData> | null }

export function SubagentsPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;

  const badge = data ? (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      {data.workers.length} log{data.workers.length !== 1 ? 's' : ''}
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
            {data.workers.map((w, i) => <WorkerCard key={i} worker={w} />)}
          </div>
        </div>
      )}
    </Panel>
  );
}

function WorkerCard({ worker }: { worker: WorkerLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border-dim)', borderRadius: 4, padding: '8px 10px', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{worker.name}</span>
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
