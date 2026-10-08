import {
  StoredChallenge,
  getAllChallenges,
  getChallengeByDate,
  getActiveChallenge,
  saveChallenge,
  deleteChallenge,
  setActiveChallenge,
  getActiveArtist,
  setActiveArtist,
} from '@/lib/db';

export type { StoredChallenge };

export function getAllStoredChallenges(): StoredChallenge[] {
  return getAllChallenges();
}

export function getStoredChallengeByDate(date: string): StoredChallenge | null {
  return getChallengeByDate(date);
}

export function getLatestActiveChallenge(): StoredChallenge | null {
  return getActiveChallenge();
}

export function saveStoredChallenge(
  challenge: Omit<StoredChallenge, 'id' | 'created_at' | 'is_active'> & { id?: string; is_active?: boolean },
  makeActive = true
): StoredChallenge {
  return saveChallenge(challenge, makeActive);
}

export function deleteStoredChallenge(id: string) {
  return deleteChallenge(id);
}

export function setActiveStoredChallenge(id: string): StoredChallenge | null {
  return setActiveChallenge(id);
}

export { getActiveArtist, setActiveArtist };
