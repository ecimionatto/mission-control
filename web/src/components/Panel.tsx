import React from 'react';

interface PanelProps {
  title: string;
  fetchedAt?: string;
  error?: string;
  loading?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Panel({ title, fetchedAt, error, loading, children, badge, style }: PanelProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px 8px',
        borderBottom: '1px solid var(--border-dim)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {title}
        </span>
        {badge}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
        {loading && !error && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>Loading…</div>
        )}
        {error && (
          <div style={{ color: 'var(--error)', fontSize: 12, padding: '8px 0', fontFamily: 'monospace' }}>
            ⚠ {error}
          </div>
        )}
        {!loading && !error && children}
      </div>

      {fetchedAt && (
        <div style={{
          padding: '5px 14px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-dim)',
          flexShrink: 0,
        }}>
          Updated {formatAgo(fetchedAt)}
        </div>
      )}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

export function Badge({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: bg ?? color + '22',
      color,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-dim)', ...style }}>
      {children}
    </div>
  );
}

export function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtDuration(secs: number | null): string {
  if (secs === null) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function shortRepo(repo: string): string {
  return repo.split('/')[1] ?? repo;
}
