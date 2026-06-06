import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type ShellOk = { ok: true; stdout: string; stderr: string };
export type ShellFail = { ok: false; error: string };
export type ShellResult = ShellOk | ShellFail;

export async function shell(
  command: string,
  args: string[],
  timeoutMs = 15_000
): Promise<ShellResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: String(err) };
  }
}

export async function shellJson<T>(
  command: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const result = await shell(command, args, timeoutMs);
  if (!result.ok) return result;
  try {
    return { ok: true, data: JSON.parse(result.stdout) as T };
  } catch {
    return { ok: false, error: `JSON parse failed: ${result.stdout.slice(0, 200)}` };
  }
}
