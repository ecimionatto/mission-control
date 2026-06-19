import React from 'react';
import { Panel } from './Panel';
import type { ApiResult, TokenUsageData, DayUsage, CacheEfficiency } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<TokenUsageData> | null }

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function TokenUsagePanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;
  const spike = data?.costSpike;

  const badge = data ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      {data.filesScanned} files
      {spike?.spike && (
        <span style={{
          background: '#e53935',
          color: '#fff',
          borderRadius: 10,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 700,
        }}>
          cost spike {spike.ratio.toFixed(1)}×
        </span>
      )}
    </span>
  ) : undefined;

  return (
    <Panel title="Token Usage" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Totals */}
          <div className="token-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Stat label="Input" value={fmt(data.totalInputTokens)} color={colors.data.blue} />
            <Stat label="Output" value={fmt(data.totalOutputTokens)} color={colors.data.green} />
            <Stat label="Cache Read" value={fmt(data.totalCacheReadTokens)} color={colors.data.amber} />
            <Stat label="Est. Cost" value={fmtUsd(data.totalCostUsd)} color={spike?.spike ? '#e53935' : colors.feedback.muted} />
          </div>

          {/* Cache efficiency */}
          {data.cacheEfficiency && (
            <CacheEfficiencyRow efficiency={data.cacheEfficiency} />
          )}

          {/* Cost spike detail */}
          {spike?.spike && (
            <div style={{
              background: '#e5393511',
              border: '1px solid #e5393544',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 10,
              color: '#e53935',
            }}>
              Cost spike: {fmtUsd(spike.latestUsd)} today vs {fmtUsd(spike.baselineUsd)} baseline ({spike.ratio.toFixed(1)}×)
            </div>
          )}

          {/* Mini bar chart */}
          {data.days.length > 0 && <DayChart days={data.days.slice(-14)} />}

          <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border-dim)', paddingTop: 6 }}>
            {data.note}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  );
}

// Mirrors server CACHE_BREAKEVEN_RATIO (server/src/modules/tokenUsage.ts) — keep in sync.
const CACHE_BREAKEVEN_RATIO = 1.4; // green at/above: cache writes are amortizing
const CACHE_AMBER_FLOOR = 1.0;     // amber down to break-even; red below (writes not paying off)

/** green ≥ break-even | amber 1.0–break-even | red < 1.0 (writes not amortizing) */
function ratioColor(ratio: number): string {
  if (ratio >= CACHE_BREAKEVEN_RATIO) return colors.feedback.success;
  if (ratio >= CACHE_AMBER_FLOOR) return colors.feedback.warning;
  return colors.feedback.error;
}

function CacheEfficiencyRow({ efficiency }: { efficiency: CacheEfficiency }) {
  const { cacheHitRate, cacheReadWriteRatio } = efficiency;
  const hitPct = `${Math.round(cacheHitRate * 100)}%`;
  const badgeColor = cacheReadWriteRatio !== null ? ratioColor(cacheReadWriteRatio) : colors.feedback.muted;
  const ratioLabel = cacheReadWriteRatio !== null ? cacheReadWriteRatio.toFixed(1) + '×' : 'n/a';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11 }}>
      <span style={{ color: 'var(--text-muted)' }}>Cache hit</span>
      <span style={{ fontWeight: 700, color: colors.data.amber }}>{hitPct}</span>
      <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>Read/write</span>
      <span style={{
        fontWeight: 700,
        color: badgeColor,
        background: badgeColor + '22',
        borderRadius: 8,
        padding: '1px 6px',
      }}>
        {ratioLabel}
      </span>
    </div>
  );
}

function DayChart({ days }: { days: DayUsage[] }) {
  const maxTotal = Math.max(...days.map(d => d.inputTokens + d.outputTokens + d.cacheReadTokens), 1);

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Daily (last {days.length} days)</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
        {days.map(day => {
          const total = day.inputTokens + day.outputTokens + day.cacheReadTokens;
          const height = Math.max(2, Math.round((total / maxTotal) * 48));
          const costLine = day.costUsd !== undefined ? `\nEst. cost: ${fmtUsd(day.costUsd)}` : '';
          return (
            <div
              key={day.date}
              title={`${day.date}\nInput: ${fmt(day.inputTokens)}\nOutput: ${fmt(day.outputTokens)}\nCache: ${fmt(day.cacheReadTokens)}${costLine}`}
              style={{
                flex: 1,
                height,
                background: colors.data.blue + 'BB',
                borderRadius: '2px 2px 0 0',
                minWidth: 4,
                cursor: 'default',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
        <span>{days[0]?.date.slice(5)}</span>
        <span>{days[days.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
