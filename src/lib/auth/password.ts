/**
 * Password hashing helpers — using bcryptjs (pure JS, Vercel-compatible).
 * Cost factor 10 — fast enough for login, slow enough to deter offline cracking.
 */
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}
