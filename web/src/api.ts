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
}

export interface TokenUsageData {
  days: DayUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  filesScanned: number;
  note: string;
}

export interface DashboardData {
  agentHealth: ApiResult<AgentHealthData>;
  prs: ApiResult<PullRequest[]>;
  workflows: ApiResult<WorkflowRun[]>;
  cost: ApiResult<CostData>;
  achievements: ApiResult<AchievementsData>;
  subagents: ApiResult<SubagentsData>;
  tokenUsage: ApiResult<TokenUsageData>;
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
