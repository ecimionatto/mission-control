import fs from 'fs';
import path from 'path';
import { makeOk, makeErr, Result, KanbanCard, KanbanData, KanbanLane } from '../types';
import { shellJson } from '../utils/shell';

const QUEUE_FILE = path.join(process.env.HOME ?? '/home/ecimio', 'clawbot/state/autonomous-queue.md');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface GhCheck {
  state?: string;
  status?: string;
  conclusion?: string;
}
interface GhPRView {
  number: number;
  statusCheckRollup: GhCheck[] | null;
}

function deriveCiStatus(checks: GhCheck[]): KanbanCard['ciStatus'] {
  if (!checks.length) return 'none';
  const states = checks.map(c => (c.state ?? c.conclusion ?? c.status ?? '').toUpperCase());
  if (states.some(s => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'WAITING'].includes(s))) return 'pending';
  if (states.some(s => ['FAILURE', 'FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(s))) return 'failure';
  if (states.some(s => s === 'SUCCESS')) return 'success';
  return 'unknown';
}

async function enrichWithGh(card: KanbanCard): Promise<void> {
  if (!card.prNumber) return;
  const repoSlug = card.repo === 'dtrain'
    ? 'ecimionatto/daily-train-app'
    : 'ecimionatto/crescendo-app';
  const result = await shellJson<GhPRView>('gh', [
    'pr', 'view', String(card.prNumber),
    '--repo', repoSlug,
    '--json', 'number,statusCheckRollup',
  ], 12_000);
  if (result.ok) {
    card.ciStatus = deriveCiStatus(result.data.statusCheckRollup ?? []);
  }
}

function prUrl(prNumber: number, repo: string): string {
  const base = repo === 'dtrain'
    ? 'https://github.com/ecimionatto/daily-train-app'
    : 'https://github.com/ecimionatto/crescendo-app';
  return `${base}/pull/${prNumber}`;
}

// Extract the section of the file immediately following `header` until the next same-level header.
function getSection(content: string, header: RegExp): string {
  const m = content.match(header);
  if (!m || m.index === undefined) return '';
  const after = content.slice(m.index + m[0].length);
  const nextHeader = after.match(/\n#{1,3}\s/);
  return nextHeader?.index !== undefined ? after.slice(0, nextHeader.index) : after;
}

function tableRows(section: string): string[] {
  return section.split('\n').filter(l => {
    const t = l.trim();
    return t.startsWith('|') && !t.startsWith('| PR') && !t.startsWith('| ---') && !/^\|[-| ]+\|$/.test(t);
  });
}

function extractShortTitle(prId: string, detail: string): string {
  // Prefer first **bold phrase** that isn't a meta-word
  const bold = detail.match(/\*\*([^*]{3,60})\*\*/);
  if (bold && !/^(MERGED|BLOCKED|FIX|APPROVE|HOLD)/i.test(bold[1].trim())) {
    return `${prId} — ${bold[1].trim()}`;
  }
  // Fall back to first clause up to 50 chars
  const plain = detail.replace(/\*\*/g, '').replace(/`[^`]*`/g, '').trim();
  const clause = plain.slice(0, 55).replace(/[,;(].*$/, '').trim();
  return clause ? `${prId} — ${clause}` : prId;
}

function parseParked(content: string): KanbanCard[] {
  const section = getSection(content, /###[^\n]*PARKED[^\n]*/);
  return tableRows(section).flatMap(row => {
    const cells = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) return [];
    const prM = cells[0].match(/\*\*(DT|CR)\s*#(\d+)\*\*/i);
    if (!prM) return [];
    const detail = cells[2] ?? cells[1];
    // Skip MERGED rows — those belong to DONE
    if (/MERGED/i.test(detail)) return [];
    const prefix = prM[1].toUpperCase();
    const num = parseInt(prM[2], 10);
    const repo = prefix === 'DT' ? 'dtrain' : 'crescendo';
    return [{
      id: `${prefix}-${num}`,
      title: extractShortTitle(`${prefix} #${num}`, detail),
      lane: 'parked' as KanbanLane,
      repo,
      prNumber: num,
      prUrl: prUrl(num, repo),
      blockedReason: 'device verify / Edson sign-off required',
    }];
  });
}

function parseBlocked(content: string): KanbanCard[] {
  const cards: KanbanCard[] = [];

  // From the ### 🔴 BLOCKED table
  const tableSection = getSection(content, /###[^\n]*BLOCKED[^\n]*/);
  for (const row of tableRows(tableSection)) {
    const cells = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const prM = cells[0].match(/\*\*(DT|CR)\s*#(\d+)\*\*/i);
    if (!prM) continue;
    const prefix = prM[1].toUpperCase();
    const num = parseInt(prM[2], 10);
    const repo = prefix === 'DT' ? 'dtrain' : 'crescendo';
    const reason = (cells[2] ?? cells[1]).slice(0, 120).replace(/\*\*/g, '');
    cards.push({
      id: `${prefix}-${num}`,
      title: `${prefix} #${num}`,
      lane: 'blocked',
      repo,
      prNumber: num,
      prUrl: prUrl(num, repo),
      blockedReason: reason,
    });
  }

  // From IN-FLIGHT section: lines with 🔴 **BLOCKED**
  const inflightSection = getSection(content, /##\s+IN-FLIGHT\b(?:\s+\(active[^)]*\))?/);
  for (const line of inflightSection.split('\n')) {
    if (!line.includes('🔴') || !line.includes('BLOCKED')) continue;
    if (line.includes('MERGED') || line.includes('CLOSED')) continue;
    const prM = line.match(/\*\*(DT|CR)\s*PR\s*#(\d+)\*\*/i);
    if (!prM) continue;
    const prefix = prM[1].toUpperCase();
    const num = parseInt(prM[2], 10);
    const id = `${prefix}-${num}`;
    if (cards.some(c => c.id === id)) continue;
    const repo = prefix === 'DT' ? 'dtrain' : 'crescendo';
    const reasonM = line.match(/BLOCKED[^:]*:\s*([^.]{0,120})/);
    cards.push({
      id,
      title: `${prefix} #${num}`,
      lane: 'blocked',
      repo,
      prNumber: num,
      prUrl: prUrl(num, repo),
      blockedReason: reasonM ? reasonM[1].trim() : 'see queue',
    });
  }

  return cards;
}

// HOLD / do-not-touch items that aren't yet in the blocked or parked tables
function parseHeld(content: string, existingIds: Set<string>): KanbanCard[] {
  const cards: KanbanCard[] = [];
  const inflightSection = getSection(content, /##\s+IN-FLIGHT\b(?:\s+\(active[^)]*\))?/);
  for (const line of inflightSection.split('\n')) {
    if (!/HOLD|do.not.touch/i.test(line)) continue;
    if (line.includes('MERGED') || line.includes('CLOSED')) continue;
    const prM = line.match(/\*\*(DT|CR)\s*PR\s*#(\d+)\*\*/i);
    if (!prM) continue;
    const prefix = prM[1].toUpperCase();
    const num = parseInt(prM[2], 10);
    const id = `${prefix}-${num}`;
    if (existingIds.has(id)) continue;
    const repo = prefix === 'DT' ? 'dtrain' : 'crescendo';
    cards.push({
      id,
      title: `${prefix} #${num}`,
      lane: 'blocked',
      repo,
      prNumber: num,
      prUrl: prUrl(num, repo),
      blockedReason: 'HOLD — stacked dependency or do-not-touch',
    });
  }
  return cards;
}

function parseDone(content: string): KanbanCard[] {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const seen = new Set<string>();
  const cards: KanbanCard[] = [];

  for (const line of content.split('\n')) {
    if (!line.includes('MERGED')) continue;
    const prMatches = [...line.matchAll(/\b(DT|CR)\s*(?:PR\s*)?#(\d+)/gi)];
    if (!prMatches.length) continue;
    const dateMatches = [...line.matchAll(/(\d{4}-\d{2}-\d{2})/g)];
    if (!dateMatches.length) continue;
    const dateStr = dateMatches[0][1];
    if (new Date(dateStr).getTime() < cutoff) continue;

    for (const m of prMatches) {
      const prefix = m[1].toUpperCase();
      const num = parseInt(m[2], 10);
      const id = `${prefix}-${num}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const repo = prefix === 'DT' ? 'dtrain' : 'crescendo';
      cards.push({
        id,
        title: `${prefix} #${num}`,
        lane: 'done',
        repo,
        prNumber: num,
        prUrl: prUrl(num, repo),
        updatedAt: dateStr,
      });
    }
  }
  return cards;
}

function parseInFlight(content: string): KanbanCard[] {
  const section = getSection(content, /##\s+IN-FLIGHT WORKERS/);
  const active = section.split('\n').filter(l => {
    const t = l.trim();
    return t.startsWith('-') && !t.includes('_(none') && !t.includes('DONE') && !t.includes('CLOSED') && !t.includes('MERGED');
  });
  return active.map((line, i) => {
    const label = line.replace(/^-\s*\*\*/, '').replace(/\*\*.*/, '').trim().slice(0, 60) || `Worker ${i + 1}`;
    return { id: `worker-${i}`, title: label, lane: 'in_flight' as KanbanLane };
  });
}

export async function fetchKanban(): Promise<Result<KanbanData>> {
  if (!fs.existsSync(QUEUE_FILE)) {
    return makeOk<KanbanData>({
      cards: [],
      constraintLane: 'parked',
      constraintNote: 'Edson device verify — physical device required, cannot be auto-processed',
      generatedAt: new Date().toISOString(),
      queueFileFound: false,
    });
  }

  let content: string;
  try {
    content = fs.readFileSync(QUEUE_FILE, 'utf8');
  } catch (err) {
    return makeErr<KanbanData>(err instanceof Error ? err.message : String(err));
  }

  const blocked = parseBlocked(content);
  const parked = parseParked(content);
  const done = parseDone(content);
  const workers = parseInFlight(content);

  const seen = new Set<string>(blocked.map(c => c.id));
  parked.forEach(c => seen.add(c.id));
  workers.forEach(c => seen.add(c.id));

  const held = parseHeld(content, seen);

  const allCards: KanbanCard[] = [];
  const dedupSeen = new Set<string>();

  for (const card of [...blocked, ...held, ...parked, ...workers, ...done]) {
    if (dedupSeen.has(card.id)) continue;
    // Don't add done cards if they appear in another lane
    if (card.lane === 'done') {
      const openLanes: KanbanLane[] = ['blocked', 'parked', 'review', 'mergeable', 'in_flight'];
      const alreadyOpen = allCards.some(c => c.id === card.id && openLanes.includes(c.lane));
      if (alreadyOpen) continue;
    }
    dedupSeen.add(card.id);
    allCards.push(card);
  }

  // GH enrichment in parallel (best-effort)
  await Promise.allSettled(allCards.filter(c => c.prNumber != null).map(enrichWithGh));

  // Sort: done newest-first, others by PR number asc
  allCards.sort((a, b) => {
    if (a.lane === 'done' && b.lane === 'done') {
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    }
    if (a.prNumber != null && b.prNumber != null) return a.prNumber - b.prNumber;
    return 0;
  });

  return makeOk<KanbanData>({
    cards: allCards,
    constraintLane: 'parked',
    constraintNote: 'Edson device verify — physical device required, cannot be auto-processed',
    generatedAt: new Date().toISOString(),
    queueFileFound: true,
  });
}
