import React from 'react';
import { Panel, formatAgo } from './Panel';
import type { ApiResult, SpanCostData } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<SpanCostData> | null }

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const STATUS_COLOR: Record<SpanCostData['budget']['status'], string> = {
  ok: colors.feedback.success,
  warn: colors.feedback.warning,
  critical: colors.feedback.error,
};

export function SpanCostPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;

  const badge = data ? (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      {data.sessions.length} sessions
    </span>
  ) : undefined;

  return (
    <Panel title="Span Cost" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <BudgetBar budget={data.budget} />

          {data.byProject.length > 0 && (
            <Section title="By Project">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <Th>Project</Th>
                    <Th align="right">Cost</Th>
                    <Th align="right">Sessions</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.byProject.map(p => (
                    <tr key={p.project} style={{ borderTop: '1px solid var(--border-dim)' }}>
                      <Td>{p.project}</Td>
                      <Td align="right" mono>{fmtUsd(p.costUsd)}</Td>
                      <Td align="right" mono>{p.sessionCount}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {data.sessions.length > 0 && (
            <Section title="Top Sessions">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <Th>Project</Th>
                    <Th>Session</Th>
                    <Th align="right">Cost</Th>
                    <Th align="right">Active</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map(s => (
                    <tr key={s.sessionId} style={{ borderTop: '1px solid var(--border-dim)' }}>
                      <Td>{s.project}</Td>
                      <Td mono>{s.sessionId.slice(0, 8)}</Td>
                      <Td align="right" mono>{fmtUsd(s.costUsd)}</Td>
                      <Td align="right">{formatAgo(s.lastActiveAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border-dim)', paddingTop: 6 }}>
            {data.note}
          </div>
        </div>
      )}
    </Panel>
  );
}

function BudgetBar({ budget }: { budget: SpanCostData['budget'] }) {
  const color = STATUS_COLOR[budget.status];
  const width = Math.min(100, Math.max(0, budget.pct));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Daily budget</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>
          {fmtUsd(budget.todayCostUsd)} / {fmtUsd(budget.dailyBudgetUsd)} ({Math.round(budget.pct)}%)
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--bg-card-alt)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${width}%`, background: color, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{ fontWeight: 600, padding: '3px 4px', textAlign: align ?? 'left' }}>{children}</th>
  );
}

function Td({ children, align, mono }: { children: React.ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td style={{
      padding: '3px 4px',
      textAlign: align ?? 'left',
      color: 'var(--text-secondary)',
      fontFamily: mono ? 'monospace' : undefined,
    }}>
      {children}
    </td>
  );
}
