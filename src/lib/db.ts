import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

function getSqliteModule(): any {
  try {
    if (typeof (process as any).getBuiltinModule === 'function') {
      return (process as any).getBuiltinModule('node:sqlite');
    }
  } catch {}
  try {
    // eslint-disable-next-line no-eval
    return eval('require')('node:sqlite');
  } catch {}
  return null;
}

export interface StoredChallenge {
  id: string;
  play_date: string; // YYYY-MM-DD or 'draft-...'
  artist_name: string;
  artist_image_url: string;
  track_pool: any[];
  all_searchable_titles: string[];
  is_draft: boolean;
  is_active: boolean;
  created_at: string;
}

function getDataDir(): string {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getDbPath(): string {
  return path.join(getDataDir(), 'game.db');
}

function getJsonBackupPath(): string {
  return path.join(getDataDir(), 'challenges.json');
}

declare global {
  // eslint-disable-next-line no-var
  var __game_db_instance__: any | undefined;
}

function getDatabase(): any {
  if (global.__game_db_instance__) {
    return global.__game_db_instance__;
  }

  const dbPath = getDbPath();
  const sqlite = getSqliteModule();
  if (!sqlite || !sqlite.DatabaseSync) {
    throw new Error('SQLite module not available in this Node runtime');
  }
  const db = new sqlite.DatabaseSync(dbPath);

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      play_date TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      artist_image_url TEXT,
      track_pool TEXT NOT NULL,
      all_searchable_titles TEXT NOT NULL,
      is_draft INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_time_ms REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Initial seeding from challenges.json if challenges table is empty
  try {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM challenges').get();
    if (countRow && countRow.count === 0) {
      const jsonPath = getJsonBackupPath();
      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : parsed?.challenges;
        if (Array.isArray(list) && list.length > 0) {
          const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO challenges 
            (id, play_date, artist_name, artist_image_url, track_pool, all_searchable_titles, is_draft, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          list.forEach((item, index) => {
            const isFirst = index === 0 && !item.is_draft;
            insertStmt.run(
              item.id || `ch-${Date.now()}-${index}`,
              item.play_date || new Date().toISOString().split('T')[0],
              item.artist_name || 'Unknown Artist',
              item.artist_image_url || '',
              JSON.stringify(item.track_pool || []),
              JSON.stringify(item.all_searchable_titles || []),
              item.is_draft ? 1 : 0,
              isFirst ? 1 : 0,
              item.created_at || new Date().toISOString()
            );

            if (isFirst) {
              db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
                .run('active_challenge_id', item.id || `ch-${Date.now()}-${index}`);
              db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
                .run('active_artist', item.artist_name || 'Unknown Artist');
            }
          });
        }
      }
    }
  } catch (e) {
    console.warn('Initial seeding error:', e);
  }

  global.__game_db_instance__ = db;
  return db;
}

function syncToDiskBackup(challenges: StoredChallenge[]) {
  try {
    const backupPath = getJsonBackupPath();
    fs.writeFileSync(backupPath, JSON.stringify({ challenges }, null, 2));
  } catch (e) {
    console.warn('Failed to sync challenges.json backup:', e);
  }
}

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function parseChallengeRow(row: any): StoredChallenge {
  let track_pool = [];
  let all_searchable_titles = [];

  try {
    track_pool = JSON.parse(row.track_pool || '[]');
  } catch {
    track_pool = [];
  }

  try {
    all_searchable_titles = JSON.parse(row.all_searchable_titles || '[]');
  } catch {
    all_searchable_titles = [];
  }

  return {
    id: row.id,
    play_date: row.play_date,
    artist_name: row.artist_name,
    artist_image_url: row.artist_image_url || '',
    track_pool,
    all_searchable_titles,
    is_draft: !!row.is_draft,
    is_active: !!row.is_active,
    created_at: row.created_at,
  };
}

export function getAllChallenges(): StoredChallenge[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM challenges ORDER BY created_at DESC').all();
  return rows.map(parseChallengeRow);
}

export function getChallengeById(id: string): StoredChallenge | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
  return row ? parseChallengeRow(row) : null;
}

export function getChallengeByDate(date: string): StoredChallenge | null {
  const db = getDatabase();
  // Prefer active challenge if it matches date
  const activeRow = db.prepare('SELECT * FROM challenges WHERE play_date = ? AND is_active = 1 AND is_draft = 0').get(date);
  if (activeRow) return parseChallengeRow(activeRow);

  const row = db.prepare('SELECT * FROM challenges WHERE play_date = ? AND is_draft = 0 ORDER BY created_at DESC LIMIT 1').get(date);
  return row ? parseChallengeRow(row) : null;
}

export function getActiveChallenge(): StoredChallenge | null {
  const db = getDatabase();

  // 1. Check settings active_challenge_id
  const activeId = getSetting('active_challenge_id');
  if (activeId) {
    const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(activeId);
    if (row && !row.is_draft) {
      return parseChallengeRow(row);
    }
  }

  // 2. Check is_active flag in table
  const activeRow = db.prepare('SELECT * FROM challenges WHERE is_active = 1 AND is_draft = 0 LIMIT 1').get();
  if (activeRow) {
    return parseChallengeRow(activeRow);
  }

  // 3. Check for today's challenge
  const today = new Date().toISOString().split('T')[0];
  const todayRow = db.prepare('SELECT * FROM challenges WHERE play_date = ? AND is_draft = 0 ORDER BY created_at DESC LIMIT 1').get(today);
  if (todayRow) {
    return parseChallengeRow(todayRow);
  }

  // 4. Return newest non-draft challenge
  const newestRow = db.prepare('SELECT * FROM challenges WHERE is_draft = 0 ORDER BY created_at DESC LIMIT 1').get();
  if (newestRow) {
    return parseChallengeRow(newestRow);
  }

  return null;
}

export function getActiveArtist(): string {
  const activeChallenge = getActiveChallenge();
  if (activeChallenge) {
    return activeChallenge.artist_name;
  }
  const savedArtist = getSetting('active_artist');
  return savedArtist || 'Wxrdie';
}

export function setActiveChallenge(id: string): StoredChallenge | null {
  const db = getDatabase();
  const challenge = getChallengeById(id);
  if (!challenge) return null;

  const today = new Date().toISOString().split('T')[0];

  // Mark all challenges inactive
  db.prepare('UPDATE challenges SET is_active = 0').run();

  // Mark this challenge active and set its play_date to today so date matching works
  db.prepare('UPDATE challenges SET is_active = 1, is_draft = 0, play_date = ? WHERE id = ?').run(today, id);

  setSetting('active_challenge_id', id);
  setSetting('active_artist', challenge.artist_name);

  const updated = getChallengeById(id);
  syncToDiskBackup(getAllChallenges());
  return updated;
}

export function setActiveArtist(artistName: string): void {
  setSetting('active_artist', artistName);

  // If a challenge already exists for this artist, activate it
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM challenges WHERE LOWER(artist_name) = LOWER(?) AND is_draft = 0 ORDER BY created_at DESC LIMIT 1').get(artistName);
  if (existing) {
    setActiveChallenge(existing.id);
  }
}

export function saveChallenge(
  challenge: Omit<StoredChallenge, 'id' | 'created_at' | 'is_active'> & { id?: string; is_active?: boolean },
  makeActive = true
): StoredChallenge {
  const db = getDatabase();
  const id = challenge.id || `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created_at = new Date().toISOString();
  const is_draft = !!challenge.is_draft;
  const is_active = !is_draft && (makeActive || !!challenge.is_active);

  if (is_active) {
    db.prepare('UPDATE challenges SET is_active = 0').run();
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO challenges 
    (id, play_date, artist_name, artist_image_url, track_pool, all_searchable_titles, is_draft, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    id,
    challenge.play_date,
    challenge.artist_name,
    challenge.artist_image_url || '',
    JSON.stringify(challenge.track_pool || []),
    JSON.stringify(challenge.all_searchable_titles || []),
    is_draft ? 1 : 0,
    is_active ? 1 : 0,
    created_at
  );

  if (is_active) {
    setSetting('active_challenge_id', id);
    setSetting('active_artist', challenge.artist_name);
  }

  const saved = getChallengeById(id)!;
  syncToDiskBackup(getAllChallenges());
  return saved;
}

export function deleteChallenge(id: string): boolean {
  const db = getDatabase();
  const activeId = getSetting('active_challenge_id');

  db.prepare('DELETE FROM challenges WHERE id = ?').run(id);

  if (activeId === id) {
    const nextActive = db.prepare('SELECT id, artist_name FROM challenges WHERE is_draft = 0 ORDER BY created_at DESC LIMIT 1').get();
    if (nextActive) {
      db.prepare('UPDATE challenges SET is_active = 1 WHERE id = ?').run(nextActive.id);
      setSetting('active_challenge_id', nextActive.id);
      setSetting('active_artist', nextActive.artist_name);
    } else {
      setSetting('active_challenge_id', '');
      setSetting('active_artist', 'Wxrdie');
    }
  }

  syncToDiskBackup(getAllChallenges());
  return true;
}

export function recordSubmission(challengeId: string, score: number, totalTimeMs: number): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO submissions (challenge_id, score, total_time_ms, created_at)
    VALUES (?, ?, ?, ?)
  `).run(challengeId, score, totalTimeMs, new Date().toISOString());
}

export function getSubmissionsStats(challengeId: string): { distribution: Record<number, number>; total: number } {
  const db = getDatabase();
  const rows = db.prepare('SELECT score FROM submissions WHERE challenge_id = ?').all(challengeId);
  const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  rows.forEach((r: any) => {
    if (r.score >= 0 && r.score <= 5) {
      distribution[r.score]++;
      total++;
    }
  });

  return { distribution, total };
}
