import { env } from 'cloudflare:workers';
import { database } from '@/db/store';
import type { Account } from './auth-types';

const config = env as unknown as Record<string, string | undefined>;
const encoder = new TextEncoder();
export const demoEnabled = () => config.DEMO_LOGIN_ENABLED !== 'false';
const accounts: Account[] = [
  { id: 'business', email: 'admin@sana.demo', name: 'Администратор бизнеса', role: 'business' },
  ...['Qadam', 'NeuroNomads', 'Steppe Data', 'Pixel Minds', 'EcoLogic'].map((name, i) => ({ id: `student-${i + 1}`, email: i ? `team${i + 1}@sana.demo` : 'student@sana.demo', name, role: 'student' as const, teamId: `t${i + 1}` })),
];
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), n => n.toString(16).padStart(2, '0')).join('');
}
function tokenOf(request: Request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)sana_auth=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token || null;
}
export async function currentAccount(request: Request): Promise<Account | null> {
  const token = tokenOf(request);
  if (!token) return null;
  const row = await database().prepare('SELECT account_id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?').bind(await digest(token), Date.now()).first<{ account_id: string }>();
  return accounts.find(account => account.id === row?.account_id) || null;
}
export async function verifyAccount(email: string, password: string) {
  const account = accounts.find(item => item.email === email.toLowerCase().trim());
  const key = account?.role === 'business' ? 'ADMIN_PASSWORD' : account?.teamId === 't1' ? 'STUDENT_PASSWORD' : `TEAM${account?.teamId?.slice(1)}_PASSWORD`;
  const expected = config[key] || (demoEnabled() ? account?.role === 'business' ? 'AdminSana2026!' : 'StudentSana2026!' : '');
  // Fixed-size comparison; credentials never cross the server boundary.
  const [left, right] = await Promise.all([digest(password), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return account && expected && !difference ? account : null;
}
export async function revokeSession(request: Request) {
  const token = tokenOf(request);
  if (token) await database().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await digest(token)).run();
}
export function authCookie(request: Request, token: string, age = 43200) {
  return `sana_auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
