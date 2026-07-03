import { shellJson } from '../utils/shell';
import { makeOk, makeErr, CostData, WorkflowRun, Result } from '../types';

// GitHub Actions Linux runner cost: ~$0.008 / minute
const LINUX_RUNNER_COST_PER_MINUTE = 0.008;

interface BillingResponse {
  total_minutes_used?: number;
  total_paid_minutes_used?: number;
  included_minutes?: number;
}

export function estimateCostFromRuns(runs: WorkflowRun[]): { estimatedUsdCost: number; totalMinutes: number } {
  let totalSeconds = 0;
  for (const run of runs) {
    if (run.durationSeconds != null && run.durationSeconds > 0) {
      totalSeconds += run.durationSeconds;
    }
  }
  const totalMinutes = totalSeconds / 60;
  const estimatedUsdCost = Math.round(totalMinutes * LINUX_RUNNER_COST_PER_MINUTE * 100) / 100;
  return { estimatedUsdCost, totalMinutes: Math.round(totalMinutes) };
}

export async function resolveGithubBillingOwner(
  shellFn: typeof shellJson = shellJson
): Promise<string | null> {
  // 1. GH_BILLING_OWNER env var
  const fromEnv = process.env.GH_BILLING_OWNER?.trim();
  if (fromEnv) return fromEnv;

  // 2. First entry of REPOS env var (take owner part of owner/repo)
  const reposEnv = process.env.REPOS?.trim();
  if (reposEnv) {
    const firstRepo = reposEnv.split(',')[0]?.trim();
    if (firstRepo) {
      const owner = firstRepo.split('/')[0];
      if (owner) return owner;
    }
  }

  // 3. Shell call to `gh api user`
  const result = await shellFn<{ login: string }>('gh', ['api', 'user'], 10_000);
  if (result.ok && result.data?.login) return result.data.login;

  return null;
}

export async function fetchCost(): Promise<Result<CostData>> {
  const owner = await resolveGithubBillingOwner();

  // If owner is null, skip the API call and go directly to estimate fallback
  const apiResult = owner
    ? await shellJson<BillingResponse>(
        'gh',
        ['api', `/users/${owner}/settings/billing/actions`],
        10_000
      )
    : { ok: false as const, error: 'No billing owner resolved' };

  if (apiResult.ok && apiResult.data?.total_minutes_used !== undefined) {
    return makeOk({
      source: 'api',
      totalMinutesUsed: apiResult.data.total_minutes_used,
      includedMinutes: apiResult.data.included_minutes,
      totalPaidMinutesUsed: apiResult.data.total_paid_minutes_used ?? 0,
      note: 'Live data from GitHub billing API.',
    });
  }

  // Fall back: estimate from recent workflow runs
  try {
    const { fetchWorkflows } = await import('./githubWorkflows');
    const runsResult = await fetchWorkflows();
    if (!runsResult.ok) {
      return makeOk({ source: 'unavailable', note: 'Billing API unavailable and workflow data missing.' });
    }
    const { estimatedUsdCost, totalMinutes } = estimateCostFromRuns(runsResult.data);
    return makeOk({
      source: 'estimate',
      totalMinutesUsed: totalMinutes,
      estimatedUsdCost,
      note: `Estimate from last ${runsResult.data.length} workflow runs × $${LINUX_RUNNER_COST_PER_MINUTE}/min (Linux runner). Billing API returned: ${apiResult.ok ? 'unexpected format' : 'error'}.`,
    });
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
