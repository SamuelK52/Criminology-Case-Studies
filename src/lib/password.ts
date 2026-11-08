import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing with scrypt (Node's built-in crypto, no native modules).
// Stored format: scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>, so parameters can be raised later
// and old hashes still verify.
const N = 2 ** 15; // 32 MiB per hash with r=8
const R = 8;
const P = 1;
const KEYLEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const nN = Number(n), nR = Number(r), nP = Number(p);
  // Refuse absurd parameters from a tampered row rather than burning memory.
  if (!(nN >= 2 ** 10 && nN <= 2 ** 20 && nR >= 1 && nR <= 32 && nP >= 1 && nP <= 4)) return false;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== KEYLEN) return false;
  const key = await derive(password, Buffer.from(salt, "base64url"), nN, nR, nP);
  return timingSafeEqual(key, expected);
}

/** A hash that never matches, used when the email is unknown so the timing doesn't reveal it. */
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(12).toString("base64url"));
  await verifyPassword(password, await dummy);
}

/** Random session token for the cookie; only its SHA-256 is stored in the database. */
export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
