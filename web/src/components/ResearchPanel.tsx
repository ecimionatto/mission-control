import React from 'react';
import { Panel, Badge } from './Panel';
import type { ApiResult, ResearchData, ResearchReport } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<ResearchData> | null }

const SOURCE_COLORS: Record<string, string> = {
  DTrain: colors.data.blue,
  Crescendo: colors.data.magenta,
  other: colors.feedback.muted,
};

export function ResearchPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : undefined;

  const badge = data ? (
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      {data.total} report{data.total !== 1 ? 's' : ''}
    </span>
  ) : undefined;

  return (
    <Panel title="Research & Trends" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={badge}>
      {data && data.reports.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 0' }}>
          No reports found. Set MC_REPORTS_DIR to your reports directory.
        </div>
      )}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.reports.map((r, i) => <ReportCard key={i} report={r} />)}
        </div>
      )}
    </Panel>
  );
}

function ReportCard({ report }: { report: ResearchReport }) {
  const sourceColor = SOURCE_COLORS[report.source] ?? colors.feedback.muted;

  return (
    <div style={{
      borderBottom: '1px solid var(--border-dim)',
      paddingBottom: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={report.source} color={sourceColor} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {report.date}
        </span>
        {report.theme && (
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, flex: 1, minWidth: 120 }}>
            {report.theme}
          </span>
        )}
      </div>
      {report.findings.length > 0 && (
        <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc' }}>
          {report.findings.map((f, i) => (
            <li key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
