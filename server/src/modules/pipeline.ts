import fs from 'fs';
import path from 'path';
import {
  makeOk, makeErr, Result,
  PipelineStage, StageWip, ComputeConstraint, PipelineData,
} from '../types';
import { shell, shellJson } from '../utils/shell';
import { fetchCost } from './githubCost';

const HOME = process.env.HOME ?? '/home/ecimio';
const REPORTS_DIR = path.join(HOME, 'clawbot/reports');
const BACKLOG_FILE = path.join(HOME, 'clawbot/backlog/BACKLOG.md');
const QUEUE_FILE = path.join(HOME, 'clawbot/state/autonomous-queue.md');
const OPS_HEALTH_FILE = path.join(HOME, 'clawbot/state/ops-health.json');

const REPOS = [
  'ecimionatto/daily-train-app',
  'ecimionatto/crescendo-app',
  'ecimionatto/statura',
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Constraint detection — pure, unit-tested. First match wins.
// ---------------------------------------------------------------------------

export function detectConstraint(
  stages: StageWip[],
  parkedCount: number,
  ciFailures24h: number,
  easInProgress = false
): { constraintStage: PipelineStage; constraintNote: string } {
  const byStage = (s: PipelineStage) => stages.find(st => st.stage === s);
  const testflight = byStage('testflight');
  const review = byStage('review');
  const dev = byStage('dev');
  const intake = byStage('intake');

  // TESTFLIGHT wip = age in days of the oldest "newest build" across apps
  if (testflight && testflight.wip > 5 && !easInProgress) {
    return {
      constraintStage: 'testflight',
      constraintNote: `Build is ${testflight.wip} days old — dispatch EAS or validate on device`,
    };
  }
  if (parkedCount > 0) {
    return {
      constraintStage: 'testflight',
      constraintNote: `${parkedCount} item(s) awaiting Edson device verify — pipeline paused at human gate`,
    };
  }
  if (review && review.wip > 2) {
    return {
      constraintStage: 'review',
      constraintNote: `${review.wip} open PRs queued — merge unblocked ones or run pr-reviewer`,
    };
  }
  if (ciFailures24h > 2) {
    return {
      constraintStage: 'ci',
      constraintNote: `${ciFailures24h} CI failures in 24h — investigate before pushing more`,
    };
  }
  if (dev && dev.wip === 0 && intake && intake.wip > 1) {
    return {
      constraintStage: 'dev',
      constraintNote: 'Items ready but no worker running — work-tick may be stalled',
    };
  }
  return {
    constraintStage: 'testflight',
    constraintNote: 'Pipeline healthy — validate latest builds to unblock App Store',
  };
}

// ---------------------------------------------------------------------------
// Local-file sources
// ---------------------------------------------------------------------------

function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / DAY_MS);
}

function scanResearch(): { days: number; detail: string } {
  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
  if (!files.length) return { days: 999, detail: 'no reports found' };
  let newest = 0;
  let newestName = '';
  for (const f of files) {
    const mtime = fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs;
    if (mtime > newest) { newest = mtime; newestName = f; }
  }
  const days = daysSince(newest);
  return { days, detail: `${newestName} — ${days}d ago` };
}

function parseBacklog(): { mustCount: number; lastReprioritized: string } {
  const content = fs.readFileSync(BACKLOG_FILE, 'utf8');
  const header = content.split('\n').slice(0, 10).join('\n');
  const mustM = header.match(/Must\s+(\d+)/);
  const dateM = header.match(/Last reprioritized:\**\s*(\d{4}-\d{2}-\d{2})/);
  return {
    mustCount: mustM ? parseInt(mustM[1], 10) : 0,
    lastReprioritized: dateM ? dateM[1] : '',
  };
}

// Extract a `## HEADER` section up to the next ## header.
function getSection(content: string, header: RegExp): string {
  const m = content.match(header);
  if (!m || m.index === undefined) return '';
  const after = content.slice(m.index + m[0].length);
  const next = after.match(/\n##\s/);
  return next?.index !== undefined ? after.slice(0, next.index) : after;
}

function parseQueue(): { devCount: number; parkedCount: number } {
  if (!fs.existsSync(QUEUE_FILE)) return { devCount: 0, parkedCount: 0 };
  const content = fs.readFileSync(QUEUE_FILE, 'utf8');

  const inflight = getSection(content, /##\s+IN-FLIGHT WORKERS/);
  const devCount = inflight.split('\n').filter(l => {
    const t = l.trim();
    return t.startsWith('-') && !t.includes('(none)');
  }).length;

  const parked = getSection(content, /##\s+PARKED\s*—\s*AWAITING EDSON/);
  const parkedCount = parked.split('\n').filter(l => {
    const t = l.trim();
    return t.startsWith('-') && !t.includes('~~') && !/MERGED/i.test(t);
  }).length;

  return { devCount, parkedCount };
}

// ---------------------------------------------------------------------------
// GitHub sources
// ---------------------------------------------------------------------------

async function countOpenPRs(): Promise<number> {
  const results = await Promise.allSettled(
    REPOS.map(repo => shellJson<Array<{ number: number }>>(
      'gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number'], 12_000
    ))
  );
  let total = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) total += r.value.data.length;
  }
  return total;
}

interface RunEntry { status?: string; conclusion?: string | null; createdAt?: string }

async function scanRuns(): Promise<{ inProgress: number; failures24h: number }> {
  const results = await Promise.allSettled(
    REPOS.map(repo => shellJson<RunEntry[]>(
      'gh', ['run', 'list', '--repo', repo, '--json', 'status,conclusion,createdAt', '--limit', '20'], 12_000
    ))
  );
  let inProgress = 0;
  let failures24h = 0;
  const cutoff = Date.now() - DAY_MS;
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    for (const run of r.value.data) {
      if (run.status === 'in_progress') inProgress++;
      if (run.conclusion === 'failure' && run.createdAt && new Date(run.createdAt).getTime() > cutoff) {
        failures24h++;
      }
    }
  }
  return { inProgress, failures24h };
}

interface TestflightBuild { app: string; build: number; ageDays: number }

// Parse the App Review Check log for lines like:
//   "- build 41 (VALID) ... uploaded=2026-08-14"
// associating each with the nearest preceding app-name mention.
export function parseReviewCheckLog(log: string): { builds: TestflightBuild[]; appstoreState: string } {
  const builds: TestflightBuild[] = [];
  let currentApp = 'DT';
  let appstoreState = '';
  for (const line of log.split('\n')) {
    if (/daily.?train|dtrain/i.test(line)) currentApp = 'DT';
    else if (/crescendo/i.test(line)) currentApp = 'CR';
    else if (/statura/i.test(line)) currentApp = 'ST';
    const buildM = line.match(/build\s+(\d+)\s+\((\w+)\).*uploaded=(\d{4}-\d{2}-\d{2})/i);
    if (buildM) {
      const uploaded = new Date(buildM[3]).getTime();
      const entry = {
        app: currentApp,
        build: parseInt(buildM[1], 10),
        ageDays: daysSince(uploaded),
      };
      // Keep only the newest build per app
      const existing = builds.find(b => b.app === entry.app);
      if (!existing) builds.push(entry);
      else if (entry.build > existing.build) Object.assign(existing, entry);
    }
    const stateM = line.match(/app\s*store\s*state[:=]\s*([A-Z_]+)/i)
      ?? line.match(/\b(READY_FOR_SALE|IN_REVIEW|WAITING_FOR_REVIEW|PREPARE_FOR_SUBMISSION|PENDING_DEVELOPER_RELEASE|REJECTED)\b/);
    if (stateM) appstoreState = stateM[1];
  }
  return { builds, appstoreState };
}

async function scanTestflight(): Promise<{ builds: TestflightBuild[]; appstoreState: string }> {
  const out: { builds: TestflightBuild[]; appstoreState: string } = { builds: [], appstoreState: '' };

  // DTrain + Crescendo come from the same "App Review Check" workflow log
  const runList = await shellJson<Array<{ databaseId: number }>>(
    'gh', ['run', 'list', '--repo', 'ecimionatto/daily-train-app',
      '--workflow', 'App Review Check', '--limit', '1', '--json', 'databaseId'], 12_000
  );
  if (runList.ok && runList.data.length) {
    const logResult = await shell(
      'gh', ['run', 'view', String(runList.data[0].databaseId),
        '--repo', 'ecimionatto/daily-train-app', '--log'], 30_000
    );
    if (logResult.ok) {
      const parsed = parseReviewCheckLog(logResult.stdout);
      out.builds.push(...parsed.builds.filter(b => b.app !== 'ST'));
      out.appstoreState = parsed.appstoreState;
    }
  }

  // Statura: age of its latest iOS Release run
  const statura = await shellJson<Array<{ createdAt: string }>>(
    'gh', ['run', 'list', '--repo', 'ecimionatto/statura',
      '--workflow', 'iOS Release', '--limit', '1', '--json', 'createdAt'], 12_000
  );
  if (statura.ok && statura.data.length) {
    out.builds.push({
      app: 'ST',
      build: 0,
      ageDays: daysSince(new Date(statura.data[0].createdAt).getTime()),
    });
  }

  return out;
}

async function countThroughput7d(): Promise<number> {
  const cutoff = Date.now() - 7 * DAY_MS;
  const results = await Promise.allSettled(
    REPOS.map(repo => shellJson<Array<{ mergedAt: string | null }>>(
      'gh', ['pr', 'list', '--repo', repo, '--state', 'merged', '--json', 'mergedAt', '--limit', '50'], 12_000
    ))
  );
  let total = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    total += r.value.data.filter(pr => pr.mergedAt && new Date(pr.mergedAt).getTime() > cutoff).length;
  }
  return total;
}

async function checkEasInProgress(): Promise<boolean> {
  const result = await shellJson<Array<{ status: string }>>(
    'gh', ['run', 'list', '--repo', 'ecimionatto/daily-train-app',
      '--workflow', 'EAS Production Build + TestFlight Submit',
      '--limit', '1', '--json', 'status,conclusion'], 12_000
  );
  return result.ok && result.data.some(r => r.status === 'in_progress');
}

// ---------------------------------------------------------------------------
// Compute constraints
// ---------------------------------------------------------------------------

async function buildComputeConstraints(easInProgress: boolean): Promise<ComputeConstraint[]> {
  const constraints: ComputeConstraint[] = [];

  // a. CI Budget — reuse the existing cost module
  try {
    const cost = await fetchCost();
    if (cost.ok) {
      const used = cost.data.totalMinutesUsed ?? 0;
      const included = cost.data.includedMinutes ?? 2000;
      const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
      constraints.push({
        name: 'CI Budget',
        value: `${Math.round(used)} min${cost.data.estimatedUsdCost != null ? ` (~$${cost.data.estimatedUsdCost})` : ''}`,
        limit: `${included} min/mo`,
        pct,
        status: pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok',
      });
    } else {
      constraints.push({ name: 'CI Budget', value: 'unavailable', limit: '2000 min/mo', pct: 0, status: 'warn' });
    }
  } catch {
    constraints.push({ name: 'CI Budget', value: 'error', limit: '2000 min/mo', pct: 0, status: 'warn' });
  }

  // b. EAS build slot — only one production build should run at a time
  constraints.push({
    name: 'EAS Build',
    value: easInProgress ? 'in progress' : 'idle',
    limit: '1 concurrent',
    pct: easInProgress ? 100 : 0,
    status: 'ok',
  });

  // c. Token quota — ops-health freshness is the proxy for API health
  try {
    const stat = fs.statSync(OPS_HEALTH_FILE);
    const ageH = (Date.now() - stat.mtimeMs) / (60 * 60 * 1000);
    const content = JSON.parse(fs.readFileSync(OPS_HEALTH_FILE, 'utf8')) as {
      actionable?: Array<{ severity: string; summary: string }>;
    };
    const apiErrors = (content.actionable ?? []).filter(a => /error|quota|rate.?limit/i.test(a.summary));
    const stale = ageH > 2;
    constraints.push({
      name: 'Token Quota',
      value: stale ? `ops-health stale (${ageH.toFixed(1)}h old)` : apiErrors.length ? `${apiErrors.length} API error(s)` : 'healthy',
      limit: 'ops-health < 2h old',
      pct: stale || apiErrors.length ? 100 : Math.min(100, Math.round((ageH / 2) * 100)),
      status: stale || apiErrors.length ? 'warn' : 'ok',
    });
  } catch {
    constraints.push({ name: 'Token Quota', value: 'ops-health.json unreadable', limit: 'ops-health < 2h old', pct: 100, status: 'warn' });
  }

  return constraints;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function stageStatus(stage: PipelineStage, wip: number): StageWip['status'] {
  switch (stage) {
    case 'research': return wip <= 7 ? 'ok' : wip <= 14 ? 'warn' : 'critical';
    case 'review': return wip <= 2 ? 'ok' : wip <= 5 ? 'warn' : 'critical';
    case 'testflight': return wip <= 5 ? 'ok' : wip <= 10 ? 'warn' : 'critical';
    default: return 'ok';
  }
}

export async function fetchPipeline(): Promise<Result<PipelineData>> {
  try {
    const [research, backlog, queue, openPRs, runs, testflight, throughput, easInProgress] =
      await Promise.allSettled([
        Promise.resolve().then(scanResearch),
        Promise.resolve().then(parseBacklog),
        Promise.resolve().then(parseQueue),
        countOpenPRs(),
        scanRuns(),
        scanTestflight(),
        countThroughput7d(),
        checkEasInProgress(),
      ]).then(([a, b, c, d, e, f, g, h]) => [
        a.status === 'fulfilled' ? a.value : { days: 999, detail: 'unavailable' },
        b.status === 'fulfilled' ? b.value : { mustCount: 0, lastReprioritized: '' },
        c.status === 'fulfilled' ? c.value : { devCount: 0, parkedCount: 0 },
        d.status === 'fulfilled' ? d.value : 0,
        e.status === 'fulfilled' ? e.value : { inProgress: 0, failures24h: 0 },
        f.status === 'fulfilled' ? f.value : { builds: [], appstoreState: '' },
        g.status === 'fulfilled' ? g.value : 0,
        h.status === 'fulfilled' ? h.value : false,
      ] as const);

    const tfMaxAge = testflight.builds.length
      ? Math.max(...testflight.builds.map(b => b.ageDays))
      : 0;
    const tfDetail = testflight.builds.length
      ? testflight.builds.map(b => `${b.app}${b.build ? ` build ${b.build}` : ''} — ${b.ageDays}d old`).join(' · ')
      : 'no build data';

    const stages: StageWip[] = [
      {
        stage: 'research', label: 'Research', wip: research.days, limit: -1,
        isConstraint: false, detail: research.detail, status: stageStatus('research', research.days),
      },
      {
        stage: 'intake', label: 'Intake', wip: backlog.mustCount, limit: -1,
        isConstraint: false,
        detail: backlog.lastReprioritized
          ? `${backlog.mustCount} Must · reprioritized ${backlog.lastReprioritized}`
          : `${backlog.mustCount} Must`,
        status: backlog.mustCount > 0 ? 'ok' : 'warn',
      },
      {
        stage: 'ready', label: 'Ready', wip: backlog.mustCount, limit: 5,
        isConstraint: false, detail: `${backlog.mustCount} Must-tier item(s) ready to build`,
        status: backlog.mustCount > 0 ? 'ok' : 'warn',
      },
      {
        stage: 'dev', label: 'Dev', wip: queue.devCount, limit: 2,
        isConstraint: false,
        detail: queue.devCount ? `${queue.devCount} worker(s) in flight` : 'no workers active',
        status: 'ok',
      },
      {
        stage: 'review', label: 'Review', wip: openPRs, limit: 2,
        isConstraint: false, detail: `${openPRs} open PR(s) across 3 repos`,
        status: stageStatus('review', openPRs),
      },
      {
        stage: 'ci', label: 'CI', wip: runs.inProgress, limit: 3,
        isConstraint: false,
        detail: `${runs.inProgress} running · ${runs.failures24h} failure(s) 24h`,
        status: runs.failures24h > 2 ? 'critical' : runs.failures24h > 0 ? 'warn' : 'ok',
      },
      {
        stage: 'testflight', label: 'TestFlight', wip: tfMaxAge, limit: -1,
        isConstraint: false, detail: tfDetail, status: stageStatus('testflight', tfMaxAge),
      },
      {
        stage: 'appstore', label: 'App Store', wip: testflight.appstoreState ? 1 : 0, limit: -1,
        isConstraint: false,
        detail: testflight.appstoreState || 'state unknown',
        status: /REJECT/i.test(testflight.appstoreState) ? 'critical' : 'ok',
      },
    ];

    const { constraintStage, constraintNote } = detectConstraint(
      stages, queue.parkedCount, runs.failures24h, easInProgress
    );
    for (const s of stages) s.isConstraint = s.stage === constraintStage;

    const computeConstraints = await buildComputeConstraints(easInProgress);

    return makeOk<PipelineData>({
      stages,
      constraintStage,
      constraintNote,
      computeConstraints,
      throughput7d: throughput,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return makeErr<PipelineData>(err instanceof Error ? err.message : String(err));
  }
}
