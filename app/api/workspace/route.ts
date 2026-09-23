import { currentAccount } from '@/lib/auth';
import type { Account } from '@/lib/auth-types';
import { database } from '@/db/store';
import { getAIConfig } from '@/lib/ai-config';
import { aiStatus, generateQuestions } from '@/lib/openai-questions';
import { readRequestBody, RequestBodyError } from '@/lib/request-body';
import { blankTask, fieldDefs, isFilled, scoreTask, seedTasks, seedProposals, teams, topics, questionsFor, type Task, type Proposal } from '@/lib/domain';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const str = (value: unknown, max = 3000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fail = (message: string, status = 400) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const SHARED = 'sana-shared-v2';
function response(data: unknown) { return Response.json(data, { headers: { 'Cache-Control': 'no-store' } }); }
async function snapshot(session: string, account: Account) {
  const db = database();
  const [tasks, proposals] = await Promise.all([
    db.prepare('SELECT payload FROM tasks WHERE session = ?').bind(session).all<{ payload: string }>(),
    db.prepare('SELECT payload FROM proposals WHERE session = ?').bind(session).all<{ payload: string }>(),
  ]);
  const allProposals: Proposal[] = proposals.results.map(x => JSON.parse(x.payload));
  const allTasks: Task[] = tasks.results.map(x => JSON.parse(x.payload));
  return { tasks: allTasks.filter(t => account.role === 'business' || t.published).map(t => ({ ...t, proposalCount: allProposals.filter(p => p.taskId === t.id).length })), proposals: allProposals.filter(p => account.role === 'business' || p.teamId === account.teamId), leaderboard: teams.map(team => ({ ...team, points: allProposals.filter(p => p.teamId === team.id && p.milestone).length * 20 })).sort((a,b) => b.points - a.points) };
}
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) return fail('Войдите в аккаунт.', 401);
    const session = SHARED;
    const db = database();
    const active = session ? await db.prepare('SELECT id FROM tasks WHERE session = ? LIMIT 1').bind(session).first() : null;
    if (!active) {
      
      await db.batch([
        ...seedTasks.map(t => db.prepare('INSERT OR IGNORE INTO tasks (id, session, payload) VALUES (?, ?, ?)').bind(`${session}-${t.id}`, session, JSON.stringify({ ...t, id: `${session}-${t.id}` }))),
        ...seedProposals.map(p => db.prepare('INSERT OR IGNORE INTO proposals (id, session, task_id, payload) VALUES (?, ?, ?, ?)').bind(`${session}-${p.id}`, session, `${session}-${p.taskId}`, JSON.stringify({ ...p, id: `${session}-${p.id}`, taskId: `${session}-${p.taskId}` }))),
      ]);
    }
    return response({ ...await snapshot(session, account), account, ai: aiStatus(getAIConfig()) });
  } catch { return fail('Не удалось загрузить рабочее пространство. Попробуйте ещё раз.', 503); }
}
// AI call throttle; role authorization is enforced for every mutation.
const questionRequests = new Map<string, number>();
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return fail('Недопустимый источник запроса.', 403);
    const account = await currentAccount(request);
    if (!account) return fail('Войдите в аккаунт.', 401);
    const session = SHARED;
    const body = await readRequestBody(request);
    const db = database();
    const adminActions = ['questions', 'saveTask', 'decide', 'milestone'];
    if (adminActions.includes(String(body.action)) && account.role !== 'business') return fail('Это действие доступно только бизнесу.', 403);
    if (['propose', 'submitProgress'].includes(String(body.action)) && account.role !== 'student') return fail('Это действие доступно только студенческой команде.', 403);
    if (!await db.prepare('SELECT id FROM tasks WHERE session = ? LIMIT 1').bind(session).first()) return fail('Сессия не найдена. Обновите страницу.', 401);
    if (body.action === 'questions') {
      const input = object(body.task);
      const task = { ...blankTask(), draft: str(input.draft), topic: topics.includes(str(input.topic)) ? str(input.topic) : 'Сервис' };
      for (const field of fieldDefs) task[field.key] = str(input[field.key]);
      if (task.draft.length < 10) return fail('Опишите задачу хотя бы в одном предложении.');
      const config = getAIConfig(), status = aiStatus(config);
      if (status.enabled && status.keyConfigured) {
        const now = Date.now();
        for (const [id, until] of questionRequests) if (until <= now) questionRequests.delete(id);
        if (questionRequests.has(session) || questionRequests.size >= 300) return response({ questions: questionsFor(task), mode: 'demo', fallback: true, reason: 'rate_limit' });
        questionRequests.set(session, now + 30000);
      }
      return response(await generateQuestions(task, config));
    }
    if (body.action === 'saveTask') {
      const input = object(body.task), id = str(input.id, 100);
      const row = id ? await db.prepare('SELECT payload FROM tasks WHERE id = ? AND session = ?').bind(id, session).first<{ payload: string }>() : null;
      if (id && !row) return fail('Задача не найдена.', 404);
      const previous: Task | null = row ? JSON.parse(row.payload) : null;
      if (previous && (input.revision ?? 0) !== (previous.revision ?? 0)) return fail('Карточка уже изменена в другой вкладке. Обновите данные и откройте её заново. Ваш ввод остался в форме.', 409);
      if (previous?.published && input.published !== true) return fail('Опубликованную задачу нельзя превратить в черновик. Сохраните подтверждённые изменения.');
      const task: Task = {
        ...blankTask(), id: id || crypto.randomUUID(), title: str(input.title, 160), org: str(input.org, 100),
        topic: topics.includes(str(input.topic)) ? str(input.topic) : 'Сервис', draft: str(input.draft),
        confirmed: input.confirmed === true, published: input.published === true,
        createdAt: previous?.createdAt || new Date().toISOString(), revision: (previous?.revision ?? 0) + 1,
      };
      for (const field of fieldDefs) task[field.key] = str(input[field.key]);
      if (task.title.length < 3) return fail('Добавьте название задачи — минимум 3 символа.');
      if (task.published && !task.confirmed) return fail('Подтвердите сведения перед публикацией.');
      if (task.published && task.org.length < 2) return fail('Укажите организацию.');
      task.score = scoreTask(task);
      if (row) {
        const result = await db.prepare('UPDATE tasks SET payload = ? WHERE id = ? AND session = ? AND payload = ?').bind(JSON.stringify(task), task.id, session, row.payload).run();
        if (!result.meta.changes) return fail('Карточка уже изменена. Обновите данные перед сохранением. Ваш ввод остался в форме.', 409);
      } else await db.prepare('INSERT INTO tasks (id, session, payload) VALUES (?, ?, ?)').bind(task.id, session, JSON.stringify(task)).run();
      return response({ task });
    }
    if (body.action === 'propose') {
      const input = object(body.proposal);
      const row = await db.prepare('SELECT payload FROM tasks WHERE id = ? AND session = ?').bind(str(input.taskId, 100), session).first<{ payload: string }>();
      if (!row || !JSON.parse(row.payload).published) return fail('Задача недоступна.', 404);
      const requestId = str(body.requestId, 100);
      if (requestId && !uuid.test(requestId)) return fail('Некорректный идентификатор отправки.');
      const proposal: Proposal = { id: requestId || crypto.randomUUID(), taskId: str(input.taskId, 100), teamId: account.teamId!, idea: str(input.idea), plan: str(input.plan), term: str(input.term, 100), link: str(input.link, 500), status: 'pending', evidence: '', milestone: false };
      if (!teams.some(t => t.id === proposal.teamId) || !isFilled(proposal.idea) || !isFilled(proposal.plan) || proposal.term.length < 2) return fail('Заполните идею, план и срок.');
      try { const link = new URL(proposal.link); if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) throw Error(); } catch { return fail('Добавьте корректную ссылку на прототип (http или https), без логина и пароля.'); }
      await db.prepare('INSERT INTO proposals (id, session, task_id, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(proposal.id, session, proposal.taskId, JSON.stringify(proposal)).run();
      const saved = await db.prepare('SELECT payload FROM proposals WHERE id = ? AND session = ?').bind(proposal.id, session).first<{ payload: string }>();
      if (!saved) return fail('Не удалось подтвердить отправку. Откройте форму заново.', 409);
      const existing: Proposal = JSON.parse(saved.payload);
      if ((['taskId', 'teamId', 'idea', 'plan', 'term', 'link'] as const).some(key => existing[key] !== proposal[key])) return fail('Этот запрос уже использован. Откройте новую форму отклика.', 409);
      return response({ proposal: existing });
    }
    if (body.action === 'decide' || body.action === 'milestone' || body.action === 'submitProgress') {
      const row = await db.prepare('SELECT payload FROM proposals WHERE id = ? AND session = ?').bind(str(body.id, 100), session).first<{ payload: string }>();
      if (!row) return fail('Отклик не найден.', 404);
      const proposal: Proposal = JSON.parse(row.payload);
      if (body.action === 'submitProgress') {
        if (proposal.teamId !== account.teamId) return fail('Чужой отклик недоступен.', 403);
        if (proposal.status !== 'chosen' || proposal.milestone) return fail('Результат можно отправить только по выбранному незавершённому отклику.');
        const evidence = str(body.evidence, 1500);
        if (!isFilled(evidence)) return fail('Опишите выполненную работу и приложите ссылку на результат.');
        proposal.evidence = evidence; proposal.evidenceSubmittedAt = new Date().toISOString();
      } else if (body.action === 'decide') {
        if (body.status !== 'chosen' && body.status !== 'rejected') return fail('Неизвестное решение.');
        if (proposal.milestone) return fail('Результат уже подтверждён.');
        proposal.status = body.status; proposal.decidedAt = new Date().toISOString();
      } else {
        if (proposal.status !== 'chosen') return fail('Сначала выберите команду.');
        if (proposal.milestone) return response({ proposal });
        const evidence = str(body.evidence, 1500);
        if (!isFilled(evidence)) return fail('Опишите проверенный результат этапа.');
        if (!proposal.evidenceSubmittedAt) return fail('Дождитесь отчёта команды о фактическом результате.');
        proposal.evidence = evidence; proposal.milestone = true; proposal.confirmedAt = new Date().toISOString();
      }
      // An old decision cannot erase a concurrently confirmed milestone.
      const result = await db.prepare('UPDATE proposals SET payload = ? WHERE id = ? AND session = ? AND payload = ?').bind(JSON.stringify(proposal), proposal.id, session, row.payload).run();
      if (!result.meta.changes) return fail('Отклик уже изменён. Обновите данные и проверьте его статус.', 409);
      return response({ proposal });
    }
    return fail('Неизвестное действие.');
  } catch (error) {
    if (error instanceof RequestBodyError) return fail(error.message, error.status);
    return fail('Не удалось сохранить изменения. Ваш ввод сохранён в форме — попробуйте ещё раз.', 503);
  }
}
