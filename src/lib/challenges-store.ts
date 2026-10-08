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

// In-memory store (primary fallback for serverless environments)
declare global {
  // eslint-disable-next-line no-var
  var __memory_challenges__: StoredChallenge[] | undefined;
}

if (!global.__memory_challenges__) {
  global.__memory_challenges__ = [];
}

// Check if running in a serverless / read-only environment like Vercel/AWS Lambda
function getDataFilePath(): string {
  // If running in AWS Lambda / Vercel (/var/task), write to /tmp which is writable
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
      return parsed.challenges || [];
    }
  } catch (e) {
    // Read failed, fall back to memory
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
    // Write failed (e.g. read-only filesystem), in-memory will retain it
    console.warn('Filesystem write not available, using in-memory store:', e);
  }
}

export function getAllStoredChallenges(): StoredChallenge[] {
  const disk = tryReadDisk();
  if (disk && disk.length > 0) {
    // Sync into global memory
    global.__memory_challenges__ = disk;
    return disk;
  }
  return global.__memory_challenges__ || [];
}

export function getStoredChallengeByDate(date: string): StoredChallenge | null {
  const all = getAllStoredChallenges();
  return all.find(c => c.play_date === date && !c.is_draft) || null;
}

export function saveStoredChallenge(challenge: Omit<StoredChallenge, 'id' | 'created_at'>): StoredChallenge {
  const all = getAllStoredChallenges();

  const id = `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newChallenge: StoredChallenge = {
    ...challenge,
    id,
    created_at: new Date().toISOString(),
  };

  const filtered = challenge.is_draft
    ? all
    : all.filter(c => c.play_date !== challenge.play_date);

  filtered.unshift(newChallenge);

  // Update in-memory
  global.__memory_challenges__ = filtered;

  // Attempt to persist to disk (/tmp in serverless or ./data in local)
  tryWriteDisk(filtered);

  return newChallenge;
}

export function deleteStoredChallenge(id: string) {
  const all = getAllStoredChallenges();
  const filtered = all.filter(c => c.id !== id);
  global.__memory_challenges__ = filtered;
  tryWriteDisk(filtered);
}
