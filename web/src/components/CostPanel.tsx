import React from 'react';
import { Panel, Badge } from './Panel';
import type { ApiResult, CostData } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<CostData> | null }

export function CostPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;

  const badge = data ? (
    <Badge
      label={data.source === 'api' ? 'live' : data.source === 'estimate' ? 'estimate' : 'n/a'}
      color={data.source === 'api' ? colors.feedback.success : data.source === 'estimate' ? colors.feedback.warning : colors.feedback.muted}
    />
  ) : undefined;

  return (
    <Panel title="GitHub Actions Cost" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.totalMinutesUsed !== undefined && (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {data.totalMinutesUsed.toLocaleString()}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>min</span>
              </div>
              {data.includedMinutes !== undefined && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {data.includedMinutes.toLocaleString()} included / month
                </div>
              )}
            </div>
          )}
          {data.estimatedUsdCost !== undefined && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              ≈ <strong style={{ color: 'var(--text-primary)' }}>${data.estimatedUsdCost.toFixed(2)}</strong> USD
            </div>
          )}
          {data.totalPaidMinutesUsed !== undefined && data.totalPaidMinutesUsed > 0 && (
            <div style={{ fontSize: 11, color: colors.feedback.warning }}>
              {data.totalPaidMinutesUsed.toLocaleString()} paid min overage
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-dim)', paddingTop: 6 }}>
            {data.note}
          </div>
        </div>
      )}
      {data?.source === 'unavailable' && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{data.note}</div>
      )}
    </Panel>
  );
}
