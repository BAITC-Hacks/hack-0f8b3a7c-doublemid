import { database } from '@/db/store';
import { blankTask, fieldDefs, isFilled, scoreTask, seedTasks, seedProposals, teams, topics, questionsFor, parseAIOutput, type Task, type Proposal } from '@/lib/domain';
function fail(message:string,status=400){return Response.json({error:message},{status});}
function sessionOf(request:Request){return request.headers.get('cookie')?.match(/(?:^|;\s*)sana_session=([a-f0-9-]{36})(?:;|$)/)?.[1];}
function response(data:unknown,session?:string,request?:Request){return Response.json(data,{headers:{'Cache-Control':'no-store',...(session?{'Set-Cookie':`sana_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${request?.url.startsWith('https:')?'; Secure':''}`}:{})}});}
async function snapshot(session:string){const db=database();const [t,p]=await Promise.all([db.prepare('SELECT payload FROM tasks WHERE session = ?').bind(session).all<{payload:string}>(),db.prepare('SELECT payload FROM proposals WHERE session = ?').bind(session).all<{payload:string}>()]);return {tasks:t.results.map(x=>JSON.parse(x.payload)),proposals:p.results.map(x=>JSON.parse(x.payload))};}
export async function GET(request:Request){try{let session=sessionOf(request);if(!session){session=crypto.randomUUID();const db=database();await db.batch([...seedTasks.map(t=>db.prepare('INSERT INTO tasks (id, session, payload) VALUES (?, ?, ?)').bind(`${session}-${t.id}`,session,JSON.stringify({...t,id:`${session}-${t.id}`}))),...seedProposals.map(p=>db.prepare('INSERT INTO proposals (id, session, task_id, payload) VALUES (?, ?, ?, ?)').bind(`${session}-${p.id}`,session,`${session}-${p.taskId}`,JSON.stringify({...p,id:`${session}-${p.id}`,taskId:`${session}-${p.taskId}`})))]);}return response(await snapshot(session),session,request);}catch(error){console.error('workspace GET',error);return fail('Не удалось загрузить рабочее пространство. Попробуйте ещё раз.',503);}}
const str=(x:unknown,max=3000)=>typeof x==='string'?x.trim().slice(0,max):'';
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return fail('Недопустимый источник запроса.',403);
 const session=sessionOf(request);if(!session)return fail('Сессия не найдена. Обновите страницу.',401);
 if(Number(request.headers.get('content-length'))>60000)return fail('Слишком большой запрос.',413);
 const body=await request.json() as Record<string, any>;const db=database();const action=body.action;
 if(action==='questions'){const t={...blankTask(),draft:str(body.task?.draft)};for(const f of fieldDefs)t[f.key]=str(body.task?.[f.key]);if(t.draft.length<10)return fail('Опишите задачу хотя бы в одном предложении.');return response({...parseAIOutput(JSON.stringify({questions:questionsFor(t)}),t),mode:'demo'});}
 if(action==='saveTask'){
  const input=body.task||{};if(input.id){const existing=await db.prepare('SELECT id FROM tasks WHERE id = ? AND session = ?').bind(str(input.id,100),session).first();if(!existing)return fail('Задача не найдена.',404);}
  const t:Task={...blankTask(),id:str(input.id,100)||crypto.randomUUID(),title:str(input.title,160),org:str(input.org,100),topic:topics.includes(input.topic)?input.topic:'Сервис',draft:str(input.draft),confirmed:input.confirmed===true,published:input.published===true,createdAt:str(input.createdAt,40)||new Date().toISOString()};for(const f of fieldDefs)t[f.key]=str(input[f.key]);
  if(t.title.length<3)return fail('Добавьте название задачи — минимум 3 символа.');if(t.published&&!t.confirmed)return fail('Подтвердите сведения перед публикацией.');if(t.published&&t.org.length<2)return fail('Укажите организацию.');t.score=scoreTask(t);
  await db.prepare('INSERT INTO tasks (id, session, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload WHERE tasks.session = excluded.session').bind(t.id,session,JSON.stringify(t)).run();return response({task:t});
 }
 if(action==='propose'){
  const input=body.proposal||{};const row=await db.prepare('SELECT payload FROM tasks WHERE id = ? AND session = ?').bind(str(input.taskId,100),session).first<{payload:string}>();if(!row||!JSON.parse(row.payload).published)return fail('Задача недоступна.',404);
  const p:Proposal={id:crypto.randomUUID(),taskId:str(input.taskId,100),teamId:str(input.teamId,20),idea:str(input.idea),plan:str(input.plan),term:str(input.term,100),link:str(input.link,500),status:'pending',evidence:'',milestone:false};if(!teams.some(t=>t.id===p.teamId)||!isFilled(p.idea)||!isFilled(p.plan)||p.term.length<2)return fail('Заполните идею, план и срок.');try{if(!['http:','https:'].includes(new URL(p.link).protocol))throw Error();}catch{return fail('Добавьте корректную ссылку на прототип (http или https).');}
  await db.prepare('INSERT INTO proposals (id, session, task_id, payload) VALUES (?, ?, ?, ?)').bind(p.id,session,p.taskId,JSON.stringify(p)).run();return response({proposal:p});
 }
 if(action==='decide'||action==='milestone'){
  const row=await db.prepare('SELECT payload FROM proposals WHERE id = ? AND session = ?').bind(str(body.id,100),session).first<{payload:string}>();if(!row)return fail('Отклик не найден.',404);const p:Proposal=JSON.parse(row.payload);
  if(action==='decide'){if(!['chosen','rejected'].includes(body.status))return fail('Неизвестное решение.');if(p.milestone)return fail('Результат уже подтверждён.');p.status=body.status;}
  else{if(p.status!=='chosen')return fail('Сначала выберите команду.');if(p.milestone)return response({proposal:p});const evidence=str(body.evidence,1500);if(!isFilled(evidence))return fail('Опишите проверенный результат этапа.');p.evidence=evidence;p.milestone=true;}
  await db.prepare('UPDATE proposals SET payload = ? WHERE id = ? AND session = ?').bind(JSON.stringify(p),p.id,session).run();return response({proposal:p});
 }
 return fail('Неизвестное действие.');
}catch(error){console.error('workspace POST',error);return fail('Не удалось сохранить изменения. Ваш ввод сохранён в форме — попробуйте ещё раз.',503);}}

