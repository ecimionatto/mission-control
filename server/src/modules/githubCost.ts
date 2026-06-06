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

export async function fetchCost(): Promise<Result<CostData>> {
  // Try the user billing endpoint (may be 410)
  const apiResult = await shellJson<BillingResponse>(
    'gh',
    ['api', '/users/ecimionatto/settings/billing/actions'],
    10_000
  );

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
