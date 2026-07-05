import React from 'react';
import { Panel } from './Panel';
import type { ApiResult, KanbanData, KanbanCard, KanbanLane } from '../api';
import { colors } from '../theme';

interface Props { result: ApiResult<KanbanData> | null }

const LANE_ORDER: KanbanLane[] = ['blocked', 'parked', 'review', 'mergeable', 'in_flight', 'done'];

const LANE_META: Record<KanbanLane, { label: string; color: string; isConstraint?: boolean }> = {
  blocked:    { label: 'BLOCKED',      color: colors.ci.failure },
  parked:     { label: 'PARKED 📌',    color: colors.feedback.warning, isConstraint: true },
  review:     { label: 'IN REVIEW',    color: colors.data.blue },
  mergeable:  { label: 'MERGEABLE ✓',  color: colors.feedback.success },
  in_flight:  { label: 'IN FLIGHT ⚡', color: colors.data.accent },
  done:       { label: 'DONE ✓',       color: colors.feedback.muted },
};

const CI_LABELS: Record<string, string> = {
  success: '✓ CI',
  failure: '✗ CI',
  pending: '… CI',
  none:    '— CI',
  unknown: '? CI',
};

const CI_COLORS: Record<string, string> = {
  success: colors.feedback.success,
  failure: colors.ci.failure,
  pending: colors.feedback.warning,
  none:    colors.feedback.muted,
  unknown: colors.feedback.muted,
};

const REPO_COLORS: Record<string, string> = {
  dtrain:    colors.data.blue,
  crescendo: colors.data.magenta,
};

function CiBadge({ status }: { status?: string }) {
  if (!status) return null;
  const label = CI_LABELS[status] ?? '? CI';
  const color = CI_COLORS[status] ?? colors.feedback.muted;
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 600,
      color,
      background: color + '22',
      padding: '1px 5px',
      borderRadius: 3,
      letterSpacing: '0.04em',
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function RepoBadge({ repo }: { repo?: string }) {
  if (!repo) return null;
  const label = repo === 'dtrain' ? 'DT' : 'CR';
  const color = REPO_COLORS[repo] ?? colors.feedback.muted;
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      color,
      background: color + '22',
      padding: '1px 5px',
      borderRadius: 3,
      letterSpacing: '0.05em',
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function KanbanCard({ card }: { card: KanbanCard }) {
  const laneColor = LANE_META[card.lane].color;
  const titleText = card.title.length > 52 ? card.title.slice(0, 52) + '…' : card.title;

  const inner = (
    <div style={{
      background: 'var(--bg-card-alt)',
      border: '1px solid var(--border-dim)',
      borderLeft: `3px solid ${laneColor}`,
      borderRadius: 4,
      padding: '6px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <RepoBadge repo={card.repo} />
        <CiBadge status={card.ciStatus} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.3, wordBreak: 'break-word' }}>
        {titleText}
      </div>
      {card.blockedReason && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, fontStyle: 'italic' }}>
          {card.blockedReason.length > 80 ? card.blockedReason.slice(0, 80) + '…' : card.blockedReason}
        </div>
      )}
      {card.updatedAt && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {card.updatedAt}
        </div>
      )}
    </div>
  );

  if (card.prUrl) {
    return (
      <a href={card.prUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    );
  }
  return inner;
}

function KanbanColumn({ lane, cards }: { lane: KanbanLane; cards: KanbanCard[] }) {
  const meta = LANE_META[lane];
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: 180,
      flex: '1 1 180px',
    }}>
      {/* Column header */}
      <div style={{
        background: meta.color + '18',
        borderBottom: `2px solid ${meta.color}`,
        padding: '6px 8px',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: meta.color,
            textTransform: 'uppercase',
          }}>
            {meta.label}
          </span>
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            borderRadius: 10,
            padding: '0 5px',
            fontWeight: 600,
          }}>
            {cards.length}
          </span>
        </div>
        {meta.isConstraint && (
          <div style={{
            marginTop: 4,
            fontSize: 9,
            fontWeight: 700,
            color: colors.ci.failure,
            letterSpacing: '0.04em',
          }}>
            ⚠ CONSTRAINT — all capacity here is blocking flow
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cards.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 2px' }}>—</div>
        ) : (
          cards.map(card => <KanbanCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

export function KanbanPanel({ result }: Props) {
  const loading = result === null;
  const error = result && !result.ok ? result.error : undefined;
  const data = result?.ok ? result.data : null;

  const laneMap = new Map<KanbanLane, KanbanCard[]>();
  LANE_ORDER.forEach(l => laneMap.set(l, []));
  data?.cards.forEach(card => laneMap.get(card.lane)?.push(card));

  const totalOpen = data ? data.cards.filter(c => c.lane !== 'done').length : 0;
  const parkedCount = laneMap.get('parked')?.length ?? 0;
  const blockedCount = laneMap.get('blocked')?.length ?? 0;
  const doneCount = laneMap.get('done')?.length ?? 0;

  const summaryBadge = data ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {blockedCount > 0 && (
        <span style={{ fontSize: 10, color: colors.ci.failure, fontWeight: 600 }}>
          {blockedCount} blocked
        </span>
      )}
      {parkedCount > 0 && (
        <span style={{ fontSize: 10, color: colors.feedback.warning, fontWeight: 600 }}>
          {parkedCount} parked
        </span>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        {totalOpen} open · {doneCount} done (7d)
      </span>
      {!data?.queueFileFound && (
        <span style={{ fontSize: 10, color: colors.feedback.warning }}>queue file not found</span>
      )}
    </div>
  ) : undefined;

  return (
    <Panel title="Work Queue · Theory of Constraints" fetchedAt={result?.fetchedAt} error={error} loading={loading} badge={summaryBadge}>
      {data && (
        <div>
          {data.queueFileFound && data.cards.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 8px' }}>
              No open items found in queue file.
            </div>
          )}
          <div style={{
            display: 'flex',
            gap: 10,
            overflowX: 'auto',
            paddingBottom: 4,
          }}>
            {LANE_ORDER.map(lane => (
              <KanbanColumn key={lane} lane={lane} cards={laneMap.get(lane) ?? []} />
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {data.constraintNote}
          </div>
        </div>
      )}
    </Panel>
  );
}
