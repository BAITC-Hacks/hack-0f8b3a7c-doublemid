import { database } from '@/db/store';
import { authCookie, currentAccount, demoEnabled, digest, revokeSession, verifyAccount } from '@/lib/auth';
import { readRequestBody, RequestBodyError } from '@/lib/request-body';

const reply = (body: unknown, status = 200, cookie?: string) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
export async function GET(request: Request) {
  try { return reply({ account: await currentAccount(request), demo: demoEnabled() }); }
  catch { return reply({ error: 'Не удалось подключиться к базе. Проверьте миграции и повторите вход.' }, 503); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Недопустимый источник запроса.' }, 403);
    const body = await readRequestBody(request);
    if (body.action === 'logout') { await revokeSession(request); return reply({ account: null }, 200, authCookie(request, '', 0)); }
    if (body.action !== 'login' || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 180 || body.password.length > 256) return reply({ error: 'Укажите email и пароль.' }, 400);
    const db = database(), now = Date.now();
    const key = await digest((request.headers.get('cf-connecting-ip') || 'local') + ':' + body.email.toLowerCase().trim());
    await db.prepare('DELETE FROM auth_attempts WHERE expires_at <= ?').bind(now).run();
    await db.prepare('INSERT INTO auth_attempts (id, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1').bind(key, now + 900000).run();
    const attempt = await db.prepare('SELECT attempts FROM auth_attempts WHERE id = ?').bind(key).first<{ attempts: number }>();
    if ((attempt?.attempts || 0) > 10) return reply({ error: 'Слишком много попыток. Повторите через 15 минут.' }, 429);
    const account = await verifyAccount(body.email, body.password);
    if (!account) return reply({ error: 'Неверный email или пароль.' }, 401);
    await revokeSession(request);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    await db.batch([
      db.prepare('DELETE FROM auth_attempts WHERE id = ?').bind(key),
      db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now),
      db.prepare('INSERT INTO auth_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), account.id, now + 43200000),
    ]);
    return reply({ account }, 200, authCookie(request, token));
  } catch (error) {
    return reply({ error: error instanceof RequestBodyError ? error.message : 'Сервис входа временно недоступен. Повторите попытку.' }, error instanceof RequestBodyError ? error.status : 503);
  }
}
