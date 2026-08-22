import { describe, it, expect } from 'vitest';
import { detectConstraint, parseReviewCheckLog } from '../modules/pipeline';
import { StageWip, PipelineStage } from '../types';

function stage(s: PipelineStage, wip: number, overrides: Partial<StageWip> = {}): StageWip {
  return {
    stage: s,
    label: s,
    wip,
    limit: -1,
    isConstraint: false,
    detail: '',
    status: 'ok',
    ...overrides,
  };
}

// A healthy baseline: fresh builds, 1 worker running, 1 open PR, backlog stocked
function healthyStages(overrides: Partial<Record<PipelineStage, number>> = {}): StageWip[] {
  const wip: Record<PipelineStage, number> = {
    research: 2,
    intake: 4,
    ready: 4,
    dev: 1,
    review: 1,
    ci: 0,
    testflight: 2,
    appstore: 1,
    ...overrides,
  };
  return (Object.keys(wip) as PipelineStage[]).map(s => stage(s, wip[s]));
}

describe('detectConstraint', () => {
  it('detects TESTFLIGHT when build is 8 days old', () => {
    const result = detectConstraint(healthyStages({ testflight: 8 }), 0, 0, false);
    expect(result.constraintStage).toBe('testflight');
    expect(result.constraintNote).toMatch(/8 days old/);
    expect(result.constraintNote).toMatch(/dispatch EAS|validate on device/);
  });

  it('does not flag stale TESTFLIGHT build when an EAS build is already in progress', () => {
    const result = detectConstraint(healthyStages({ testflight: 8 }), 0, 0, true);
    expect(result.constraintNote).not.toMatch(/dispatch EAS/);
  });

  it('detects device-verify constraint when parked > 0', () => {
    const result = detectConstraint(healthyStages(), 2, 0, false);
    expect(result.constraintStage).toBe('testflight');
    expect(result.constraintNote).toMatch(/2 item\(s\) awaiting Edson device verify/);
    expect(result.constraintNote).toMatch(/human gate/);
  });

  it('detects REVIEW constraint when open PRs > 2', () => {
    const result = detectConstraint(healthyStages({ review: 4 }), 0, 0, false);
    expect(result.constraintStage).toBe('review');
    expect(result.constraintNote).toMatch(/4 open PRs/);
  });

  it('detects CI constraint when failures in 24h > 2', () => {
    const result = detectConstraint(healthyStages(), 0, 3, false);
    expect(result.constraintStage).toBe('ci');
    expect(result.constraintNote).toMatch(/3 CI failures in 24h/);
  });

  it('detects DEV constraint when no workers and Must items exist', () => {
    const result = detectConstraint(healthyStages({ dev: 0, intake: 4 }), 0, 0, false);
    expect(result.constraintStage).toBe('dev');
    expect(result.constraintNote).toMatch(/no worker running/);
  });

  it('defaults to TESTFLIGHT when pipeline is clean', () => {
    const result = detectConstraint(healthyStages(), 0, 0, false);
    expect(result.constraintStage).toBe('testflight');
    expect(result.constraintNote).toMatch(/Pipeline healthy/);
  });

  it('prioritizes stale build over parked items (first match wins)', () => {
    const result = detectConstraint(healthyStages({ testflight: 9 }), 1, 0, false);
    expect(result.constraintNote).toMatch(/9 days old/);
  });

  it('prioritizes parked items over review backlog', () => {
    const result = detectConstraint(healthyStages({ review: 5 }), 1, 0, false);
    expect(result.constraintNote).toMatch(/awaiting Edson/);
  });
});

describe('parseReviewCheckLog', () => {
  it('extracts build number and age per app', () => {
    const log = [
      'App Review Check\tcheck\tDTrain status:',
      '- build 41 (VALID) something uploaded=2026-08-14',
      'App Review Check\tcheck\tCrescendo status:',
      '- build 13 (VALID) something uploaded=2026-08-20',
    ].join('\n');
    const { builds } = parseReviewCheckLog(log);
    const dt = builds.find(b => b.app === 'DT');
    const cr = builds.find(b => b.app === 'CR');
    expect(dt?.build).toBe(41);
    expect(cr?.build).toBe(13);
    expect(dt!.ageDays).toBeGreaterThan(cr!.ageDays);
  });

  it('keeps only the newest build per app', () => {
    const log = [
      'DTrain:',
      '- build 40 (EXPIRED) uploaded=2026-08-01',
      '- build 41 (VALID) uploaded=2026-08-14',
    ].join('\n');
    const { builds } = parseReviewCheckLog(log);
    expect(builds).toHaveLength(1);
    expect(builds[0].build).toBe(41);
  });

  it('extracts App Store state when present', () => {
    const log = 'DTrain app store state: READY_FOR_SALE';
    const { appstoreState } = parseReviewCheckLog(log);
    expect(appstoreState).toBe('READY_FOR_SALE');
  });
});
