import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export type Role = 'agent' | 'manager' | 'higher_manager' | 'admin';

export interface PublicUser {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  branch_id: number | null;
  status: 'active' | 'inactive';
  created_at: string;
}

interface UserRecord extends PublicUser {
  password_hash: string;
}

interface SessionRecord {
  userId: number;
  expiresAt: number;
}

interface OtpRecord {
  userId: number;
  code: string;
  expiresAt: number;
  attempts: number;
}

interface PasswordResetRecord {
  userId: number;
  expiresAt: number;
}

const SESSION_COOKIE = 'microbank_session';
const OTP_COOKIE = 'microbank_otp';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const DEMO_OTP = '123456';

const users = new Map<number, UserRecord>();
const sessions = new Map<string, SessionRecord>();
const otpChallenges = new Map<string, OtpRecord>();
const passwordResetChallenges = new Map<string, PasswordResetRecord>();
let nextUserId = 4;

function passwordHash(password: string, salt = randomBytes(16).toString('hex')): string {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function passwordMatches(password: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function seedUser(id: number, fullName: string, email: string, role: Role, password: string, branchId: number | null): void {
  users.set(id, {
    id,
    full_name: fullName,
    email,
    role,
    branch_id: branchId,
    status: 'active',
    created_at: new Date().toISOString(),
    password_hash: passwordHash(password),
  });
}

if (!users.size) {
  seedUser(1, 'Maya Perera', 'manager@ravindu.bank', 'manager', 'password', 1);
  seedUser(2, 'Sunil Fernando', 'higher@ravindu.bank', 'higher_manager', 'password', null);
  seedUser(3, 'Kavindu Jayawardena', 'admin@ravindu.bank', 'admin', 'password', null);
}

export function publicUser(user: UserRecord): PublicUser {
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function findUserByEmail(email: string): UserRecord | undefined {
  const normalized = email.trim().toLowerCase();
  return [...users.values()].find((user) => user.email === normalized);
}

export function findUserById(id: number): UserRecord | undefined {
  return users.get(id);
}

export function authenticate(email: string, password: string): UserRecord | undefined {
  const user = findUserByEmail(email);
  return user && user.status === 'active' && passwordMatches(password, user.password_hash) ? user : undefined;
}

export function createOtpChallenge(userId: number): string {
  const challenge = randomUUID();
  otpChallenges.set(challenge, { userId, code: DEMO_OTP, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return challenge;
}

export function verifyOtpChallenge(challenge: string, code: string): UserRecord | undefined {
  const record = otpChallenges.get(challenge);
  if (!record || record.expiresAt < Date.now() || record.attempts >= 5) return undefined;
  record.attempts += 1;
  if (record.code !== code.trim()) return undefined;
  otpChallenges.delete(challenge);
  return findUserById(record.userId);
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getUserForSession(token: string | undefined): UserRecord | undefined {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return findUserById(session.userId);
}

export function deleteSession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function resetPassword(email: string, password: string): boolean {
  const user = findUserByEmail(email);
  if (!user) return false;
  updatePassword(user, password);
  return true;
}

function updatePassword(user: UserRecord, password: string): void {
  user.password_hash = passwordHash(password);
  for (const [token, session] of sessions) if (session.userId === user.id) sessions.delete(token);
}

export function createPasswordResetChallenge(email: string): string | undefined {
  const user = findUserByEmail(email);
  if (!user || user.status !== 'active') return undefined;
  const token = randomBytes(32).toString('hex');
  passwordResetChallenges.set(token, { userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 });
  return token;
}

export function completePasswordReset(token: string, password: string): boolean {
  const challenge = passwordResetChallenges.get(token);
  if (!challenge || challenge.expiresAt < Date.now()) return false;
  const user = findUserById(challenge.userId);
  if (!user) return false;
  updatePassword(user, password);
  passwordResetChallenges.delete(token);
  return true;
}

export function listUsers(): PublicUser[] {
  return [...users.values()].map(publicUser);
}

export function createUser(input: { full_name: string; email: string; password: string; role: Role; branch_id: number | null }): PublicUser {
  const email = input.email.trim().toLowerCase();
  if (findUserByEmail(email)) throw new Error('A user with this email already exists.');
  const user: UserRecord = {
    id: nextUserId++,
    full_name: input.full_name.trim(),
    email,
    role: input.role,
    branch_id: input.branch_id,
    status: 'active',
    created_at: new Date().toISOString(),
    password_hash: passwordHash(input.password),
  };
  users.set(user.id, user);
  return publicUser(user);
}

export function updateUser(id: number, input: Partial<Pick<UserRecord, 'full_name' | 'email' | 'role' | 'branch_id' | 'status' | 'password_hash'>>): PublicUser | undefined {
  const user = findUserById(id);
  if (!user) return undefined;
  if (input.email && input.email.trim().toLowerCase() !== user.email && findUserByEmail(input.email)) {
    throw new Error('A user with this email already exists.');
  }
  if (input.full_name !== undefined) user.full_name = input.full_name.trim();
  if (input.email !== undefined) user.email = input.email.trim().toLowerCase();
  if (input.role !== undefined) user.role = input.role;
  if (input.branch_id !== undefined) user.branch_id = input.branch_id;
  if (input.status !== undefined) user.status = input.status;
  if (input.password_hash !== undefined) user.password_hash = passwordHash(input.password_hash);
  return publicUser(user);
}

export function deleteUser(id: number): boolean {
  if (!users.has(id)) return false;
  users.delete(id);
  for (const [token, session] of sessions) {
    if (session.userId === id) sessions.delete(token);
  }
  return true;
}

export const authCookies = { SESSION_COOKIE, OTP_COOKIE, SESSION_TTL_MS };

export function roleFromInput(value: unknown): Role | undefined {
  if (value === 'agent' || value === 'manager' || value === 'higher_manager' || value === 'admin') return value;
  if (value === 'Branch Manager') return 'manager';
  if (value === 'Higher Management') return 'higher_manager';
  if (value === 'System Administrator') return 'admin';
  return undefined;
}

export function hashForAudit(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
