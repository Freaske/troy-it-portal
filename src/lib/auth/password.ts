import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_PREFIX = "s2";

function parseHashedPassword(stored: string): { salt: string; hash: string } | null {
  const [prefix, salt, hash] = stored.split(":");
  if (prefix !== PASSWORD_PREFIX || !salt || !hash) {
    return null;
  }

  return { salt, hash };
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(plain, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `${PASSWORD_PREFIX}:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parseHashedPassword(stored);
  if (!parsed) {
    return plain === stored;
  }

  const expected = Buffer.from(parsed.hash, "hex");
  const actual = (await scrypt(plain, parsed.salt, SCRYPT_KEY_LENGTH)) as Buffer;

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
