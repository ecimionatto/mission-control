import React from 'react';
import { Panel, Dot, Badge } from './Panel';
import type { ApiResult, AgentHealthData } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<AgentHealthData> | null }

export function AgentHealthPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;

  const statusColor = data
    ? data.gatewayStatus === 'up'
      ? colors.feedback.success
      : data.gatewayStatus === 'down'
      ? colors.feedback.error
      : colors.feedback.warning
    : colors.feedback.muted;

  const badge = data ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Dot color={statusColor} />
      <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>
        {data.gatewayStatus.toUpperCase()}
      </span>
    </div>
  ) : undefined;

  return (
    <Panel title="Agent Health" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KV label="Gateway" value={`port ${data.port}`} />
          <KV label="Model" value={data.model.replace('anthropic/', '')} highlight />
          {data.fallbacks.length > 0 && (
            <KV label="Fallbacks" value={data.fallbacks.map(f => f.replace('anthropic/', '')).join(' → ')} />
          )}
          {data.connectivityProbe && (
            <KV label="Probe" value={data.connectivityProbe} />
          )}
          {data.uptime && <KV label="Uptime" value={data.uptime} />}
        </div>
      )}
    </Panel>
  );
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'right', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}
