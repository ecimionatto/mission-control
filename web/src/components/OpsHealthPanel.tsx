import React from 'react';
import { Panel, Row, Dot, Badge } from './Panel';
import type { ApiResult, OpsHealthData, SecurityCounts } from '../api';
import { colors } from '../theme';

interface Props {
  result: ApiResult<OpsHealthData> | null;
  repos: string[];
}

function securityColor(counts: SecurityCounts): string {
  if (counts.critical > 0) return colors.feedback.error;
  if (counts.high > 0) return colors.feedback.warning;
  return colors.feedback.success;
}

function securityLabel(counts: SecurityCounts): string {
  if (counts.critical > 0) return `${counts.critical} CRITICAL`;
  if (counts.high > 0) return `${counts.high} HIGH`;
  return 'clean';
}

function pipelineColor(count: number): string {
  if (count > 3) return colors.feedback.error;
  if (count > 0) return colors.feedback.warning;
  return colors.feedback.success;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 80, flexShrink: 0 }}>
      {children}
    </span>
  );
}

export function OpsHealthPanel({ result, repos }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : null;

  const generatedBadge = data ? (
    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
      {new Date(data.generatedAt).toLocaleTimeString()}
    </span>
  ) : undefined;

  return (
    <Panel title="Ops Health" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={generatedBadge}>
      {data && repos.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          No repos configured — set REPOS in .env
        </div>
      )}
      {data && repos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Security — Dependabot */}
          <Row>
            <SectionLabel>Dependabot</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {repos.map(repo => {
                const counts = data.security.dependabotAlerts[repo] ?? { critical: 0, high: 0, moderate: 0, low: 0 };
                const color = securityColor(counts);
                return (
                  <span key={repo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Dot color={color} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {repo.replace('-app', '')}
                    </span>
                    <Badge label={securityLabel(counts)} color={color} />
                  </span>
                );
              })}
            </div>
          </Row>

          {/* Security — npm audit */}
          <Row>
            <SectionLabel>npm audit</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {repos.map(repo => {
                const counts = data.security.npmAudit[repo] ?? { critical: 0, high: 0, moderate: 0, low: 0 };
                const color = securityColor(counts);
                return (
                  <span key={repo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Dot color={color} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {repo.replace('-app', '')}
                    </span>
                    <Badge label={securityLabel(counts)} color={color} />
                  </span>
                );
              })}
            </div>
          </Row>

          {/* Pipelines */}
          <Row>
            <SectionLabel>Pipelines</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <Dot color={pipelineColor(data.pipelines.last24hFailureCount)} />
              <span style={{ fontSize: 11, color: pipelineColor(data.pipelines.last24hFailureCount), fontWeight: 600 }}>
                {data.pipelines.last24hFailureCount} failure{data.pipelines.last24hFailureCount !== 1 ? 's' : ''} (24h)
              </span>
              {data.pipelines.last24hFailures.length > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {data.pipelines.last24hFailures.slice(0, 3).map(f => f.workflowName).join(', ')}
                </span>
              )}
            </div>
          </Row>

          {/* Crashes */}
          <Row>
            <SectionLabel>Crashes</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {repos.map(repo => {
                const crash = data.crashes[repo];
                const count = crash?.last7dCount;
                return (
                  <span key={repo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {repo.replace('-app', '')}
                    </span>
                    <span style={{ fontSize: 11, color: count == null ? 'var(--text-muted)' : count > 0 ? colors.feedback.error : colors.feedback.success, fontWeight: 600 }}>
                      {count == null ? '—' : `${count}`}
                    </span>
                  </span>
                );
              })}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>7d</span>
            </div>
          </Row>

          {/* Tech Debt */}
          <Row style={{ borderBottom: 'none' }}>
            <SectionLabel>Tech Debt</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {repos.map(repo => {
                const debt = data.techDebt[repo];
                const count = debt?.openIssues ?? 0;
                return (
                  <span key={repo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {repo.replace('-app', '')}
                    </span>
                    <span style={{ fontSize: 11, color: count > 0 ? colors.feedback.warning : 'var(--text-muted)', fontWeight: 600 }}>
                      {count}
                    </span>
                  </span>
                );
              })}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>open issues</span>
            </div>
          </Row>

          {/* Actionable alerts */}
          {data.actionable.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 0 0' }}>
              {data.actionable.slice(0, 3).map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '3px 0',
                  fontSize: 11,
                }}>
                  <Badge
                    label={item.severity}
                    color={item.severity === 'critical' ? colors.feedback.error : colors.feedback.warning}
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>{item.summary}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
