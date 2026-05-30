import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A valid bcrypt hash used to equalize login timing when the email is unknown,
// so an attacker cannot distinguish "no such user" from "wrong password" by
// response time. The plaintext is irrelevant; it must never match a real input.
export const DUMMY_HASH = bcrypt.hashSync("invalid-credentials-placeholder", SALT_ROUNDS);
