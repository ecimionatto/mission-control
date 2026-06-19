// Types mirror server/src/types.ts — kept in sync manually.

export type ApiResult<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; error: string; fetchedAt: string };

export interface AgentHealthData {
  gatewayStatus: 'up' | 'down' | 'unknown';
  uptime?: string;
  model: string;
  fallbacks: string[];
  port: number;
  connectivityProbe?: string;
  rawStatus?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed';
  repo: string;
  author: string;
  updatedAt: string;
  ciStatus: 'success' | 'failure' | 'pending' | 'none' | 'unknown';
  url: string;
  isDraft: boolean;
}

export interface WorkflowRun {
  id: number;
  name: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  startedAt: string;
  updatedAt: string;
  durationSeconds: number | null;
  repo: string;
  event: string;
}

export interface CostData {
  source: 'api' | 'estimate' | 'unavailable';
  totalMinutesUsed?: number;
  includedMinutes?: number;
  totalPaidMinutesUsed?: number;
  estimatedUsdCost?: number;
  note: string;
}

export interface Achievement {
  type: 'merged_pr' | 'report';
  title: string;
  date: string;
  repo?: string;
  prNumber?: number;
  url?: string;
  author?: string;
}

export interface AchievementsData {
  items: Achievement[];
  recentReports: Array<{ name: string; date: string; theme?: string }>;
}

export interface WorkerLog {
  name: string;
  logFile: string;
  lastLines: string[];
  modifiedAt: string;
  sizeBytes: number;
}

export interface SubagentsData {
  workers: WorkerLog[];
  note: string;
}

export interface DayUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd?: number;
}

export interface CostSpikeResult {
  spike: boolean;
  latestUsd: number;
  baselineUsd: number;
  ratio: number;
}

export interface CacheEfficiency {
  /** Fraction of all prompt tokens served from cache (0–1). */
  cacheHitRate: number;
  /** Cache reads per write. null when no writes exist. */
  cacheReadWriteRatio: number | null;
}

export interface TokenUsageData {
  days: DayUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCostUsd: number;
  costSpike: CostSpikeResult;
  cacheEfficiency: CacheEfficiency;
  filesScanned: number;
  note: string;
}

export type WorkerStatus = 'active' | 'idle' | 'stuck';

export interface TracedWorker {
  name: string;
  logFile: string;
  modifiedAt: string;
  status: WorkerStatus;
  retryCount: number;
  reason: string;
}

export interface FleetTracingData {
  workers: TracedWorker[];
  stuckCount: number;
  note: string;
}

export interface ResearchReport {
  source: string;
  theme: string;
  date: string;
  findings: string[];
  file: string;
}

export interface ResearchData {
  reports: ResearchReport[];
  total: number;
}

export interface RepoRatio {
  repo: string;
  total: number;
  aiAuthored: number;
  ratio: number;
}

export interface AiRatioData {
  repos: RepoRatio[];
  overall: { total: number; aiAuthored: number; ratio: number };
  windowDays: number;
}

export interface SecurityCounts { critical: number; high: number; moderate: number; low: number }
export interface PipelineFailure { repo: string; workflowName: string; conclusion: string; createdAt: string; url: string }
export interface TechDebtItem { number: number; title: string; url: string }
export interface OpsHealthData {
  generatedAt: string;
  security: {
    dependabotAlerts: Record<string, SecurityCounts>;
    npmAudit: Record<string, SecurityCounts>;
  };
  pipelines: { last24hFailures: PipelineFailure[]; last24hFailureCount: number };
  crashes: Record<string, { last7dCount: number | null; note?: string }>;
  techDebt: Record<string, { openIssues: number; items: TechDebtItem[] }>;
  actionable: Array<{ severity: string; type: string; repo: string; summary: string; url?: string }>;
}

export interface DashboardData {
  agentHealth: ApiResult<AgentHealthData>;
  prs: ApiResult<PullRequest[]>;
  workflows: ApiResult<WorkflowRun[]>;
  cost: ApiResult<CostData>;
  achievements: ApiResult<AchievementsData>;
  subagents: ApiResult<SubagentsData>;
  tokenUsage: ApiResult<TokenUsageData>;
  research: ApiResult<ResearchData>;
  aiRatio: ApiResult<AiRatioData>;
  fleetTracing: ApiResult<FleetTracingData>;
  opsHealth: ApiResult<OpsHealthData>;
}

const TOKEN_KEY = 'mc_dashboard_token';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setStoredToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}`, 'X-Dashboard-Token': token };
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/all', { headers: authHeaders() });
  if (res.status === 401) throw new Error('401');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<DashboardData>;
}
