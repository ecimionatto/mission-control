import { readdir, readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { makeOk, makeErr, ResearchReport, ResearchData, Result } from '../types';

function getReportsDir(): string {
  const env = process.env.MC_REPORTS_DIR;
  if (env) return env.replace(/^~/, homedir());
  return join(homedir(), 'clawbot', 'reports');
}

function parseDateFromFilename(filename: string): string {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? filename.replace('.md', '');
}

function parseSource(filename: string, content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  const combined = (firstLine + ' ' + filename).toLowerCase();
  if (combined.includes('crescendo')) return 'Crescendo';
  if (combined.includes('dtrain') || combined.includes('daily')) return 'DTrain';
  return 'other';
}

function parseTheme(content: string): string {
  // Match *Theme:* or **Theme:** variations
  const m = content.match(/\*+Theme[*:]+\s*\**\s*(.+)/i);
  if (m) return m[1].trim().replace(/\*+$/, '').trim();
  // Fallback: first h2 heading
  const h2 = content.match(/^##\s+(.+)/m);
  if (h2) return h2[1].trim();
  return '';
}

function parseFindings(content: string): string[] {
  const findings: string[] = [];

  // Look for content after a *Findings* section marker
  const sectionMatch = content.match(/\*Findings?\*[^•\n]*([\s\S]+?)(?:\n\n\*\*|$)/i);
  const searchText = sectionMatch ? sectionMatch[1] : content;

  // Extract bullet items separated by • or newline list markers
  for (const chunk of searchText.split(/[•]/)) {
    const cleaned = chunk.replace(/\*+/g, '').replace(/^\s*[-]\s+/, '').trim();
    if (cleaned.length > 5 && cleaned.length < 250) {
      findings.push(cleaned);
    }
    if (findings.length >= 3) break;
  }

  // Fallback: markdown list items
  if (findings.length === 0) {
    const bullets = content.match(/^[•\-\*]\s+.+/gm) ?? [];
    for (const b of bullets) {
      const cleaned = b.replace(/^[•\-\*]\s+/, '').replace(/\*+/g, '').trim();
      if (cleaned.length > 5) findings.push(cleaned);
      if (findings.length >= 3) break;
    }
  }

  return findings;
}

export function parseReport(filename: string, content: string): ResearchReport {
  return {
    source: parseSource(filename, content),
    theme: parseTheme(content),
    date: parseDateFromFilename(filename),
    findings: parseFindings(content),
    file: filename,
  };
}

export async function fetchResearch(): Promise<Result<ResearchData>> {
  const reportsDir = getReportsDir();
  try {
    const files = await readdir(reportsDir);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse().slice(0, 20);

    const reports: ResearchReport[] = [];
    for (const file of mdFiles) {
      try {
        const content = await readFile(join(reportsDir, file), 'utf8');
        reports.push(parseReport(file, content));
      } catch {
        // skip unreadable files
      }
    }

    return makeOk({ reports, total: reports.length });
  } catch (err) {
    return makeErr(err instanceof Error ? err.message : String(err));
  }
}
