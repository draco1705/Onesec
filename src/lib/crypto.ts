import crypto from 'crypto';

const SECRET = process.env.GAME_SECRET || 'super-secret-key-that-is-at-least-32-bytes-long!';
// Derive a 32-byte key for AES
const ENCRYPTION_KEY = crypto.scryptSync(SECRET, 'salt', 32);

export function encryptUrl(url: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(url, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return Buffer.from(JSON.stringify({ iv: iv.toString('hex'), encrypted, authTag })).toString('base64');
}

export function decryptUrl(token: string): string {
  try {
    const { iv, encrypted, authTag } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new Error('Invalid audio token');
  }
}

export function createSessionToken(challengeId: string): string {
  const startMs = Date.now();
  const payload = `${challengeId}:${startMs}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

export function verifySessionToken(token: string, challengeId: string): number {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [tokenChallengeId, startMsStr, signature] = decoded.split(':');
    
    if (tokenChallengeId !== challengeId) throw new Error('Challenge mismatch');
    
    const payload = `${tokenChallengeId}:${startMsStr}`;
    const expectedSignature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    
    if (signature !== expectedSignature) throw new Error('Invalid signature');
    
    return parseInt(startMsStr, 10);
  } catch {
    throw new Error('Invalid session token');
  }
}
