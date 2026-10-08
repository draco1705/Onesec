import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

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

const DATA_DIR = path.join(process.cwd(), 'data');
const CHALLENGES_FILE = path.join(DATA_DIR, 'challenges.json');

function ensureDataFile() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(CHALLENGES_FILE)) {
    writeFileSync(CHALLENGES_FILE, JSON.stringify({ challenges: [] }, null, 2));
  }
}

export function getAllStoredChallenges(): StoredChallenge[] {
  try {
    ensureDataFile();
    const raw = readFileSync(CHALLENGES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.challenges || [];
  } catch (e) {
    console.error('Error reading challenges.json:', e);
    return [];
  }
}

export function getStoredChallengeByDate(date: string): StoredChallenge | null {
  const all = getAllStoredChallenges();
  return all.find(c => c.play_date === date && !c.is_draft) || null;
}

export function saveStoredChallenge(challenge: Omit<StoredChallenge, 'id' | 'created_at'>): StoredChallenge {
  ensureDataFile();
  const all = getAllStoredChallenges();

  const id = `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newChallenge: StoredChallenge = {
    ...challenge,
    id,
    created_at: new Date().toISOString(),
  };

  // If saving for a specific play_date that isn't a draft, replace any existing active challenge for that date
  const filtered = challenge.is_draft
    ? all
    : all.filter(c => c.play_date !== challenge.play_date);

  filtered.unshift(newChallenge);

  writeFileSync(CHALLENGES_FILE, JSON.stringify({ challenges: filtered }, null, 2));
  return newChallenge;
}

export function deleteStoredChallenge(id: string) {
  ensureDataFile();
  const all = getAllStoredChallenges();
  const filtered = all.filter(c => c.id !== id);
  writeFileSync(CHALLENGES_FILE, JSON.stringify({ challenges: filtered }, null, 2));
}
