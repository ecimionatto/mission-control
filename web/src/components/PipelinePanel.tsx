import React from 'react';
import { Panel } from './Panel';
import { colors } from '../theme';
import type { ApiResult, PipelineData, StageWip, ComputeConstraint } from '../api';

const STAGE_ABBREV: Record<string, string> = {
  research: 'RES',
  intake: 'INT',
  ready: 'RDY',
  dev: 'DEV',
  review: 'REV',
  ci: 'CI',
  testflight: 'TF',
  appstore: 'AS',
};

const STATUS_COLOR: Record<StageWip['status'], string> = {
  ok: colors.feedback.success,
  warn: colors.feedback.warning,
  critical: colors.ci.failure,
};

function StageBox({ stage }: { stage: StageWip }) {
  const color = STATUS_COLOR[stage.status];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 62, flexShrink: 0 }} title={`${stage.label}: ${stage.detail}`}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: colors.data.vermillion, height: 12, lineHeight: '12px' }}>
        {stage.isConstraint ? 'CONSTRAINT' : ' '}
      </div>
      <div style={{
        width: '100%',
        background: color + '22',
        border: stage.isConstraint ? `2px solid ${colors.data.vermillion}` : '1px solid var(--border)',
        borderRadius: 4,
        padding: '6px 4px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
          {STAGE_ABBREV[stage.stage] ?? stage.stage.slice(0, 3).toUpperCase()}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'monospace' }}>
          {stage.wip}
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>
          {stage.limit === -1 ? 'no limit' : `limit ${stage.limit}`}
        </div>
      </div>
    </div>
  );
}

function ComputeRow({ c }: { c: ComputeConstraint }) {
  const color = STATUS_COLOR[c.status];
  return (
    <tr>
      <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.name}</td>
      <td style={{ padding: '3px 8px 3px 0', color, fontFamily: 'monospace' }}>{c.value}</td>
      <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.limit}</td>
      <td style={{ padding: '3px 0', color, fontFamily: 'monospace', textAlign: 'right' }}>{c.pct}%</td>
    </tr>
  );
}

export function PipelinePanel({ result }: { result: ApiResult<PipelineData> | null }) {
  if (!result) return <Panel title="Production Line" loading><span /></Panel>;
  if (!result.ok) return <Panel title="Production Line" error={result.error} fetchedAt={result.fetchedAt}><span /></Panel>;

  const data = result.data;
  const constraint = data.stages.find(s => s.isConstraint);

  return (
    <Panel title="Production Line · ToC" fetchedAt={result.fetchedAt}>
      {/* Stage flow */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 4 }}>
        {data.stages.map((s, i) => (
          <React.Fragment key={s.stage}>
            {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11, paddingBottom: 16, flexShrink: 0 }}>→</span>}
            <StageBox stage={s} />
          </React.Fragment>
        ))}
      </div>

      {/* Constraint note */}
      <div style={{
        marginTop: 8,
        padding: '7px 10px',
        borderRadius: 4,
        background: colors.data.vermillion + '26',
        border: `1px solid ${colors.data.vermillion}55`,
        fontSize: 11,
        color: 'var(--text-primary)',
      }}>
        <span style={{ fontWeight: 700, color: colors.data.vermillion, marginRight: 6 }}>
          ⛓ {constraint?.label ?? data.constraintStage}
        </span>
        {data.constraintNote}
        {constraint?.detail && (
          <span style={{ color: 'var(--text-muted)' }}> · {constraint.detail}</span>
        )}
      </div>

      {/* Compute constraints */}
      {data.computeConstraints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Compute
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              {data.computeConstraints.map(c => <ComputeRow key={c.name} c={c} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* Throughput footer */}
      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        7d throughput: <span style={{ color: colors.feedback.success, fontWeight: 600 }}>{data.throughput7d}</span> PRs merged
      </div>
    </Panel>
  );
}
