// Deliberately free of "server-only" so scripts/user.mts can reuse exactly the same hashing as the app.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt (built into Node, memory-hard, no extra dependency).
 * Parameters follow the OWASP guidance for scrypt (N=2^16, r=8, p=2 = 64 MiB per hash).
 * Stored format: scrypt$N$r$p$<salt base64>$<hash base64>  - the parameters travel with the hash,
 * so they can be raised later and old hashes are upgraded the next time that user signs in.
 */
const PARAMS = { N: 65536, r: 8, p: 2 } as const;
const KEY_LEN = 32;
const SALT_LEN = 16;
const MAX_N = 1 << 17; // refuse absurd parameters from a corrupted row instead of exhausting memory

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEY_LEN, { N, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

function parse(stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return null;
  const N = Number(n), R = Number(r), P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) return null;
  if (N < 2 || N > MAX_N || (N & (N - 1)) !== 0 || R < 1 || R > 16 || P < 1 || P > 16) return null;
  return { N, r: R, p: P, salt: Buffer.from(salt, "base64"), hash: Buffer.from(hash, "base64") };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || parsed.hash.length !== KEY_LEN) return false;
  const key = await derive(password, parsed.salt, parsed.N, parsed.r, parsed.p);
  return timingSafeEqual(key, parsed.hash);
}

/** True when a stored hash was made with weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.N !== PARAMS.N || parsed.r !== PARAMS.r || parsed.p !== PARAMS.p;
}

/**
 * A real hash of a random password nobody knows. Signing in with an unknown email verifies against it, so a
 * missing account takes as long as a wrong password and cannot be told apart by timing.
 */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(randomBytes(24).toString("base64")));
}

export const MIN_PASSWORD_LENGTH = 12;
