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

export const DEFAULT_ARTIST = 'Playboi Carti';

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
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
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
  // eslint-disable-next-line no-var
  var __game_settings_cache__: Map<string, string> | undefined;
}

if (!global.__game_settings_cache__) {
  global.__game_settings_cache__ = new Map();
}

function getDatabase(): any {
  if (global.__game_db_instance__) {
    return global.__game_db_instance__;
  }

  const sqlite = getSqliteModule();
  if (!sqlite || !sqlite.DatabaseSync) {
    return null;
  }

  try {
    const dbPath = getDbPath();
    const db = new sqlite.DatabaseSync(dbPath, { readOnly: false });

    // Enable WAL mode & timeout for high-concurrency Windows support
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec('PRAGMA synchronous = NORMAL;');
    } catch (e) {
      console.warn('SQLite PRAGMA setup warning:', e);
    }

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
        const jsonList = readJsonDisk();
        if (jsonList.length > 0) {
          const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO challenges 
            (id, play_date, artist_name, artist_image_url, track_pool, all_searchable_titles, is_draft, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          jsonList.forEach((item, index) => {
            const isFirst = index === 0 && !item.is_draft;
            insertStmt.run(
              item.id || `ch-${Date.now()}-${index}`,
              item.play_date || new Date().toISOString().split('T')[0],
              item.artist_name || 'Unknown Artist',
              item.artist_image_url || '',
              JSON.stringify(item.track_pool || []),
              JSON.stringify(item.all_searchable_titles || []),
              item.is_draft ? 1 : 0,
              item.is_active ? 1 : (isFirst ? 1 : 0),
              item.created_at || new Date().toISOString()
            );

            if (isFirst || item.is_active) {
              db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
                .run('active_challenge_id', item.id || `ch-${Date.now()}-${index}`);
              db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
                .run('active_artist', item.artist_name || 'Unknown Artist');
            }
          });
        }
      }
    } catch (e) {
      console.warn('Initial seeding note:', e);
    }

    global.__game_db_instance__ = db;
    return db;
  } catch (err: any) {
    console.warn('Could not open SQLite DatabaseSync directly (using resilient JSON storage):', err.message);
    return null;
  }
}

function readJsonDisk(): StoredChallenge[] {
  try {
    const backupPath = getJsonBackupPath();
    if (fs.existsSync(backupPath)) {
      const raw = fs.readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.challenges;
      if (Array.isArray(list)) {
        return list.map(item => normalizeChallengeData(item));
      }
    }
  } catch (e) {
    console.warn('readJsonDisk error:', e);
  }
  return [];
}

function syncToDiskBackup(challenges: StoredChallenge[]) {
  try {
    const backupPath = getJsonBackupPath();
    fs.writeFileSync(backupPath, JSON.stringify({ challenges }, null, 2));
  } catch (e) {
    console.warn('Failed to sync challenges.json backup:', e);
  }
}

function normalizeChallengeData(item: any): StoredChallenge {
  const imageUrl = item.artist_image_url || '';

  let track_pool = [];
  try {
    track_pool = typeof item.track_pool === 'string' ? JSON.parse(item.track_pool) : (item.track_pool || []);
  } catch {
    track_pool = [];
  }

  let all_searchable_titles = [];
  try {
    all_searchable_titles = typeof item.all_searchable_titles === 'string' ? JSON.parse(item.all_searchable_titles) : (item.all_searchable_titles || []);
  } catch {
    all_searchable_titles = [];
  }

  return {
    id: item.id || `ch-${Date.now()}`,
    play_date: item.play_date || new Date().toISOString().split('T')[0],
    artist_name: item.artist_name || 'Unknown Artist',
    artist_image_url: imageUrl,
    track_pool,
    all_searchable_titles,
    is_draft: !!item.is_draft,
    is_active: !!item.is_active,
    created_at: item.created_at || new Date().toISOString(),
  };
}

export function getSetting(key: string): string | null {
  const db = getDatabase();
  if (db) {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      if (row?.value) {
        global.__game_settings_cache__?.set(key, row.value);
        return row.value;
      }
    } catch {}
  }
  return global.__game_settings_cache__?.get(key) || null;
}

export function setSetting(key: string, value: string): void {
  global.__game_settings_cache__?.set(key, value);
  const db = getDatabase();
  if (db) {
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    } catch (e: any) {
      console.warn('SQLite setSetting error (using cached setting):', e.message);
    }
  }
}

export function getAllChallenges(): StoredChallenge[] {
  const db = getDatabase();
  if (db) {
    try {
      const rows = db.prepare('SELECT * FROM challenges ORDER BY created_at DESC').all();
      if (rows && rows.length > 0) {
        return rows.map((r: any) => normalizeChallengeData(r));
      }
    } catch (e: any) {
      console.warn('SQLite getAllChallenges error, using JSON store:', e.message);
    }
  }
  return readJsonDisk();
}

export function getChallengeById(id: string): StoredChallenge | null {
  const all = getAllChallenges();
  return all.find(c => c.id === id) || null;
}

export function getChallengeByDate(date: string): StoredChallenge | null {
  const all = getAllChallenges();
  // Prefer active challenge if matching date
  const active = all.find(c => c.play_date === date && c.is_active && !c.is_draft);
  if (active) return active;

  return all.find(c => c.play_date === date && !c.is_draft) || null;
}

export function getActiveChallenge(): StoredChallenge | null {
  const all = getAllChallenges();
  if (all.length === 0) return null;

  // 1. Check settings active_challenge_id
  const activeId = getSetting('active_challenge_id');
  if (activeId) {
    const found = all.find(c => c.id === activeId && !c.is_draft);
    if (found) return found;
  }

  // 2. Check is_active flag in table
  const activeFlagged = all.find(c => c.is_active && !c.is_draft);
  if (activeFlagged) return activeFlagged;

  // 3. Check for today's challenge
  const today = new Date().toISOString().split('T')[0];
  const todayItem = all.find(c => c.play_date === today && !c.is_draft);
  if (todayItem) return todayItem;

  // 4. Return newest non-draft challenge
  return all.find(c => !c.is_draft) || null;
}

export function getActiveArtist(): string {
  const activeChallenge = getActiveChallenge();
  if (activeChallenge) {
    return activeChallenge.artist_name;
  }
  const savedArtist = getSetting('active_artist');
  return savedArtist || DEFAULT_ARTIST;
}

export function setActiveChallenge(id: string): StoredChallenge | null {
  const all = getAllChallenges();
  const challenge = all.find(c => c.id === id);
  if (!challenge) return null;

  const today = new Date().toISOString().split('T')[0];
  challenge.is_active = true;
  challenge.is_draft = false;
  challenge.play_date = today;

  // Update all other challenges
  all.forEach(c => {
    if (c.id !== id) c.is_active = false;
  });

  setSetting('active_challenge_id', id);
  setSetting('active_artist', challenge.artist_name);

  // Update SQLite safely
  const db = getDatabase();
  if (db) {
    try {
      db.prepare('UPDATE challenges SET is_active = 0').run();
      db.prepare('UPDATE challenges SET is_active = 1, is_draft = 0, play_date = ? WHERE id = ?').run(today, id);
    } catch (e: any) {
      console.warn('SQLite setActiveChallenge update error (saved to JSON/memory):', e.message);
    }
  }

  syncToDiskBackup(all);
  return challenge;
}

export function setActiveArtist(artistName: string): void {
  setSetting('active_artist', artistName);

  const all = getAllChallenges();
  const existing = all.find(c => !c.is_draft && c.artist_name.toLowerCase().trim() === artistName.toLowerCase().trim());
  if (existing) {
    setActiveChallenge(existing.id);
  }
}

export function saveChallenge(
  challenge: Omit<StoredChallenge, 'id' | 'created_at' | 'is_active'> & { id?: string; is_active?: boolean },
  makeActive = true
): StoredChallenge {
  const id = challenge.id || `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created_at = new Date().toISOString();
  const is_draft = !!challenge.is_draft;
  const is_active = !is_draft && (makeActive || !!challenge.is_active);

  const imageUrl = challenge.artist_image_url || '';

  const newChallenge: StoredChallenge = {
    id,
    play_date: challenge.play_date,
    artist_name: challenge.artist_name,
    artist_image_url: imageUrl,
    track_pool: challenge.track_pool || [],
    all_searchable_titles: challenge.all_searchable_titles || [],
    is_draft,
    is_active,
    created_at,
  };

  const all = getAllChallenges();
  const filtered = is_draft ? all : all.filter(c => c.id !== id);

  if (is_active) {
    filtered.forEach(c => { c.is_active = false; });
  }

  const existingIdx = filtered.findIndex(c => c.id === id);
  if (existingIdx >= 0) {
    filtered[existingIdx] = newChallenge;
  } else {
    filtered.unshift(newChallenge);
  }

  if (is_active) {
    setSetting('active_challenge_id', id);
    setSetting('active_artist', newChallenge.artist_name);
  }

  // Update SQLite safely
  const db = getDatabase();
  if (db) {
    try {
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
        newChallenge.play_date,
        newChallenge.artist_name,
        newChallenge.artist_image_url,
        JSON.stringify(newChallenge.track_pool),
        JSON.stringify(newChallenge.all_searchable_titles),
        is_draft ? 1 : 0,
        is_active ? 1 : 0,
        created_at
      );
    } catch (sqliteErr: any) {
      console.warn('SQLite saveChallenge error (resiliently saved to JSON):', sqliteErr.message);
    }
  }

  syncToDiskBackup(filtered);
  return newChallenge;
}

export function deleteChallenge(id: string): boolean {
  const all = getAllChallenges();
  const filtered = all.filter(c => c.id !== id);
  const activeId = getSetting('active_challenge_id');

  const db = getDatabase();

  if (activeId === id) {
    const nextActive = filtered.find(c => !c.is_draft);
    if (nextActive) {
      nextActive.is_active = true;
      setSetting('active_challenge_id', nextActive.id);
      setSetting('active_artist', nextActive.artist_name);
      if (db) {
        try {
          db.prepare('UPDATE challenges SET is_active = 0').run();
          db.prepare('UPDATE challenges SET is_active = 1 WHERE id = ?').run(nextActive.id);
        } catch (e: any) {
          console.warn('SQLite nextActive update error:', e.message);
        }
      }
    } else {
      setSetting('active_challenge_id', '');
      setSetting('active_artist', DEFAULT_ARTIST);
    }
  }

  if (db) {
    try {
      db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
    } catch (e: any) {
      console.warn('SQLite deleteChallenge error:', e.message);
    }
  }

  syncToDiskBackup(filtered);
  return true;
}

export function recordSubmission(challengeId: string, score: number, totalTimeMs: number): void {
  const db = getDatabase();
  if (db) {
    try {
      db.prepare(`
        INSERT INTO submissions (challenge_id, score, total_time_ms, created_at)
        VALUES (?, ?, ?, ?)
      `).run(challengeId, score, totalTimeMs, new Date().toISOString());
    } catch (e: any) {
      console.warn('SQLite recordSubmission error:', e.message);
    }
  }
}

export function getSubmissionsStats(challengeId: string): { distribution: Record<number, number>; total: number } {
  const db = getDatabase();
  const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  if (db) {
    try {
      const rows = db.prepare('SELECT score FROM submissions WHERE challenge_id = ?').all(challengeId);
      rows.forEach((r: any) => {
        if (r.score >= 0 && r.score <= 5) {
          distribution[r.score]++;
          total++;
        }
      });
      return { distribution, total };
    } catch (e: any) {
      console.warn('SQLite getSubmissionsStats error:', e.message);
    }
  }

  return { distribution, total };
}
