import React, { useState, useEffect, useCallback } from 'react';
import { fetchDashboard, getStoredToken, setStoredToken } from './api';
import type { DashboardData } from './api';
import { AgentHealthPanel } from './components/AgentHealthPanel';
import { PRsPanel } from './components/PRsPanel';
import { WorkflowsPanel } from './components/WorkflowsPanel';
import { CostPanel } from './components/CostPanel';
import { AchievementsPanel } from './components/AchievementsPanel';
import { SubagentsPanel } from './components/SubagentsPanel';
import { TokenUsagePanel } from './components/TokenUsagePanel';
import { ResearchPanel } from './components/ResearchPanel';
import { AiRatioPanel } from './components/AiRatioPanel';
import { OpsHealthPanel } from './components/OpsHealthPanel';
import { KanbanPanel } from './components/KanbanPanel';
import { PipelinePanel } from './components/PipelinePanel';

const POLL_INTERVAL_MS = 30_000;

function useAutoRefresh() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [needsToken, setNeedsToken] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchDashboard();
      setData(result);
      setLastRefresh(new Date());
      setError(null);
      setNeedsToken(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === '401') {
        setNeedsToken(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, lastRefresh, needsToken, refresh };
}

export default function App() {
  const { data, loading, error, lastRefresh, needsToken, refresh } = useAutoRefresh();

  if (needsToken) {
    return <TokenGate onSubmit={token => { setStoredToken(token); refresh(); }} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 20px 32px' }}>
        <Header lastRefresh={lastRefresh} loading={loading} onRefresh={refresh} />

        {error && (
          <div style={{ background: '#1a0000', border: '1px solid var(--error)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--error)' }}>
            ⚠ {error}
          </div>
        )}

        <div className="mc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 }}>
          {/* Production line — ToC pipeline with constraint detection */}
          <div style={{ gridColumn: 'span 12' }}>
            <PipelinePanel result={data?.pipeline ?? null} />
          </div>

          {/* Row 1: Agent Health, Cost, AI Ratio, Token Usage */}
          <div style={{ gridColumn: 'span 3' }}>
            <AgentHealthPanel result={data?.agentHealth ?? null} />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <CostPanel result={data?.cost ?? null} />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <AiRatioPanel result={data?.aiRatio ?? null} />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <TokenUsagePanel result={data?.tokenUsage ?? null} />
          </div>

          {/* Row 2: PRs + Workflows */}
          <div style={{ gridColumn: 'span 6' }}>
            <PRsPanel result={data?.prs ?? null} />
          </div>
          <div style={{ gridColumn: 'span 6' }}>
            <WorkflowsPanel result={data?.workflows ?? null} />
          </div>

          {/* Row 3: Achievements + Subagents */}
          <div style={{ gridColumn: 'span 6' }}>
            <AchievementsPanel result={data?.achievements ?? null} />
          </div>
          <div style={{ gridColumn: 'span 6' }}>
            <SubagentsPanel result={data?.subagents ?? null} fleetTracing={data?.fleetTracing ?? null} />
          </div>

          {/* Kanban */}
          <div style={{ gridColumn: 'span 12' }}>
            <KanbanPanel result={data?.kanban ?? null} />
          </div>

          {/* Row 4: Ops Health */}
          <div style={{ gridColumn: 'span 12' }}>
            <OpsHealthPanel result={data?.opsHealth ?? null} />
          </div>

          {/* Row 5: Research (full width) */}
          <div style={{ gridColumn: 'span 12' }}>
            <ResearchPanel result={data?.research ?? null} />
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
          Mission Control · LAN-only · auto-refresh every {POLL_INTERVAL_MS / 1000}s
        </div>
      </div>
    </div>
  );
}

function Header({ lastRefresh, loading, onRefresh }: { lastRefresh: Date | null; loading: boolean; onRefresh: () => void }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
      borderBottom: '1px solid var(--border)',
      paddingBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
          Mission Control
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {now.toLocaleTimeString()}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {lastRefresh && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            last refresh {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: loading ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            padding: '10px 16px',
            minHeight: 40,
            minWidth: 80,
          }}
        >
          {loading ? '…' : '↺ Refresh'}
        </button>
      </div>
    </div>
  );
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [val, setVal] = useState(getStoredToken());

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '32px 40px', width: 340, maxWidth: 'calc(100vw - 48px)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 20, color: 'var(--text-primary)' }}>
          Mission Control
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Dashboard token required.
        </div>
        <input
          type="password"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && val && onSubmit(val)}
          placeholder="Enter DASHBOARD_TOKEN"
          autoFocus
          style={{
            width: '100%',
            background: 'var(--bg-card-alt)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '8px 10px',
            outline: 'none',
            marginBottom: 12,
            minHeight: 40,
          }}
        />
        <button
          onClick={() => val && onSubmit(val)}
          style={{
            width: '100%',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '11px',
            minHeight: 44,
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
