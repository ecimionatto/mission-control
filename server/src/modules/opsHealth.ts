import fs from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { makeOk, makeErr, OpsHealthData, Result } from '../types';

function getOpsHealthFile(): string {
  const env = process.env.OPS_HEALTH_FILE;
  if (env) return env.replace(/^~/, homedir());
  return join(homedir(), 'clawbot', 'state', 'ops-health.json');
}

export async function fetchOpsHealth(): Promise<Result<OpsHealthData>> {
  const filePath = getOpsHealthFile();
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return makeErr<OpsHealthData>(`ops-health.json not found: ${msg}`);
  }
  try {
    const data = JSON.parse(raw) as OpsHealthData;
    return makeOk(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return makeErr<OpsHealthData>(`Failed to parse ops-health.json: ${msg}`);
  }
}
