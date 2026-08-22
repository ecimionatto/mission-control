import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
  };
});

// Mock shell util to avoid real GH calls during tests
vi.mock('../utils/shell', () => ({
  shell: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  shellJson: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
}));

import fs from 'fs';
import { fetchKanban } from '../modules/kanban';

const FIXTURE_PARKED = `
## PENDING TASKS

### 🔴 BLOCKED — needs author fixes before merge

| PR | Repo | Blocker |
|----|------|---------|
| **DT #37** | daily-train-app | Stale base — reverts 30 files of shipped work. Must rebase. |
| **DT #38** | daily-train-app | Dead code — hasIOS18Inputs always false in prod. |

### 🟡 PARKED — waiting on Edson on-device sign-off

| PR | Repo | What's needed |
|----|------|--------------|
| **DT #50** | daily-train-app | **Offline Siri App Intent** native plugin — needs expo run:ios device verify. |
| **CR #85** | crescendo-app | Bundle export/import — pr-reviewer: APPROVE. Device verify needed. |
| **DT #56** | daily-train-app | **MERGED by Edson himself 2026-06-17** some detail here. Already done. |

## IN-FLIGHT WORKERS

- _(none active)_
`;

// Dates computed relative to now so the "within 7 days" assertions don't rot.
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const FIXTURE_DONE = `
### 🟡 PARKED — waiting on Edson on-device sign-off

| PR | Repo | What's needed |
|----|------|--------------|
| **DT #72** | daily-train-app | **MERGED by Edson himself ${daysAgoIso(1)} 09:02 EDT** — some detail. Done. |

## TICK LOG

- ${daysAgoIso(2)} 08:46 EDT — Tick: **MERGED DT #71** main 03502fa. Ping msg 1906.

## IN-FLIGHT WORKERS

- _(none active)_
`;

const FIXTURE_IN_FLIGHT = `
### 🔴 BLOCKED — needs author fixes before merge

| PR | Repo | Blocker |
|----|------|---------|

### 🟡 PARKED — waiting on Edson on-device sign-off

| PR | Repo | What's needed |
|----|------|--------------|

## IN-FLIGHT

- **DT PR #46** — fix/ios18-effort-and-mood — NEW. **BLOCKED from merge:** stacked on #36. HOLD — retarget after #36 verify.

## IN-FLIGHT WORKERS

- PREBUILD HEALED worker active stuff here running
`;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('fetchKanban', () => {
  it('returns queueFileFound: false when the queue file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.queueFileFound).toBe(false);
    expect(result.data.cards).toHaveLength(0);
    expect(result.data.constraintLane).toBe('parked');
  });

  it('detects PARKED items and skips MERGED rows', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_PARKED);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parked = result.data.cards.filter(c => c.lane === 'parked');
    // DT #50 and CR #85 should be parked; DT #56 (MERGED) should not be parked
    expect(parked.some(c => c.id === 'DT-50')).toBe(true);
    expect(parked.some(c => c.id === 'CR-85')).toBe(true);
    expect(parked.some(c => c.id === 'DT-56')).toBe(false);
  });

  it('detects BLOCKED items from the blocked table', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_PARKED);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocked = result.data.cards.filter(c => c.lane === 'blocked');
    expect(blocked.some(c => c.id === 'DT-37')).toBe(true);
    expect(blocked.some(c => c.id === 'DT-38')).toBe(true);
    expect(blocked.find(c => c.id === 'DT-37')?.blockedReason).toMatch(/Stale base/i);
  });

  it('detects DONE items from MERGED lines within the last 7 days', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_DONE);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const done = result.data.cards.filter(c => c.lane === 'done');
    // DT #71 (2026-07-03) and DT #72 (2026-07-04) are recent
    expect(done.some(c => c.id === 'DT-71')).toBe(true);
    expect(done.some(c => c.id === 'DT-72')).toBe(true);
  });

  it('skips DONE items merged more than 7 days ago', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const oldMergeFixture = `
### 🟡 PARKED — waiting on Edson on-device sign-off

| PR | Repo | What's needed |
|----|------|--------------|

## TICK LOG

- 2026-06-01 12:00 EDT — Tick: **MERGED DT #10** main abc123. Old merge.

## IN-FLIGHT WORKERS

- _(none active)_
`;
    vi.mocked(fs.readFileSync).mockReturnValue(oldMergeFixture);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const done = result.data.cards.filter(c => c.lane === 'done');
    expect(done.some(c => c.id === 'DT-10')).toBe(false);
  });

  it('extracts PR number correctly from DT and CR patterns', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_PARKED);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dt50 = result.data.cards.find(c => c.id === 'DT-50');
    const cr85 = result.data.cards.find(c => c.id === 'CR-85');
    expect(dt50?.prNumber).toBe(50);
    expect(dt50?.repo).toBe('dtrain');
    expect(cr85?.prNumber).toBe(85);
    expect(cr85?.repo).toBe('crescendo');
  });

  it('detects HOLD items from IN-FLIGHT section as blocked', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_IN_FLIGHT);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocked = result.data.cards.filter(c => c.lane === 'blocked');
    expect(blocked.some(c => c.id === 'DT-46')).toBe(true);
  });

  it('detects in-flight workers and skips _(none active)_ lines', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_IN_FLIGHT);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inFlight = result.data.cards.filter(c => c.lane === 'in_flight');
    // The fixture has an active worker line ("PREBUILD HEALED...")
    expect(inFlight.length).toBeGreaterThan(0);
  });

  it('sets constraintLane and constraintNote correctly', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.constraintLane).toBe('parked');
    expect(result.data.constraintNote).toMatch(/device/i);
  });

  it('does not include a parked MERGED item in the parked lane', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(FIXTURE_PARKED);
    const result = await fetchKanban();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parkedIds = result.data.cards.filter(c => c.lane === 'parked').map(c => c.id);
    expect(parkedIds).not.toContain('DT-56');
  });
});
