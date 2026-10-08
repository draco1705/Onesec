import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

export interface StoredChallenge {
  id: string;
  play_date: string; // YYYY-MM-DD or 'draft-...'
  artist_name: string;
  artist_image_url: string;
  track_pool: any[];
  all_searchable_titles: string[];
  is_draft?: boolean;
  created_at: string;
}

// Global in-memory storage fallback
declare global {
  // eslint-disable-next-line no-var
  var __memory_challenges__: StoredChallenge[] | undefined;
}

if (!global.__memory_challenges__) {
  global.__memory_challenges__ = [];
}

function getDataFilePath(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith('/var/task')) {
    return path.join(os.tmpdir(), 'challenges.json');
  }
  return path.join(process.cwd(), 'data', 'challenges.json');
}

function tryReadDisk(): StoredChallenge[] | null {
  try {
    const filePath = getDataFilePath();
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && Array.isArray(parsed.challenges)) {
        return parsed.challenges;
      }
    }
  } catch (e) {
    console.warn('tryReadDisk error:', e);
  }
  return null;
}

function tryWriteDisk(challenges: StoredChallenge[]) {
  try {
    const filePath = getDataFilePath();
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify({ challenges }, null, 2));
  } catch (e) {
    console.warn('Filesystem write not available, using in-memory store:', e);
  }
}

export function getAllStoredChallenges(): StoredChallenge[] {
  const disk = tryReadDisk();
  if (disk !== null) {
    global.__memory_challenges__ = disk;
    return disk;
  }
  return global.__memory_challenges__ || [];
}

export function getStoredChallengeByDate(date: string): StoredChallenge | null {
  const all = getAllStoredChallenges();
  // Return the latest active challenge matching this date
  return all.find(c => c.play_date === date && !c.is_draft) || null;
}

export function getLatestActiveChallenge(): StoredChallenge | null {
  const all = getAllStoredChallenges();
  const nonDrafts = all.filter(c => !c.is_draft && !c.play_date.startsWith('draft-'));
  return nonDrafts[0] || null;
}

export function saveStoredChallenge(challenge: Omit<StoredChallenge, 'id' | 'created_at'>): StoredChallenge {
  const all = getAllStoredChallenges();

  const id = `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newChallenge: StoredChallenge = {
    ...challenge,
    id,
    created_at: new Date().toISOString(),
  };

  // If publishing an active challenge (not draft), overwrite any existing challenge with the same date
  const filtered = challenge.is_draft
    ? all
    : all.filter(c => c.play_date !== challenge.play_date);

  filtered.unshift(newChallenge);

  global.__memory_challenges__ = filtered;
  tryWriteDisk(filtered);

  return newChallenge;
}

export function deleteStoredChallenge(id: string) {
  const all = getAllStoredChallenges();
  const filtered = all.filter(c => c.id !== id);
  global.__memory_challenges__ = filtered;
  tryWriteDisk(filtered);
}
