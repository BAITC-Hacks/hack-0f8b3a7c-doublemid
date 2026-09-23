import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:4173';
const first=await fetch(base+'/api/workspace');assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0];
let state=await first.json();assert.equal(state.tasks.length,5);assert.equal(state.proposals.length,5);
assert.equal(state.ai?.enabled,false,'Disable real OpenAI requests before running the offline API regression test.');
async function post(action,payload={},expected=200){const r=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},body:JSON.stringify({action,...payload})});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
const q=await post('questions',{task:{draft:'Хотим автоматизировать заявки клиентов.'}});assert.ok(q.questions.length>=3);
let {task}=await post('saveTask',{task:{title:'Тестовый кейс: заявки',org:'Учебная организация',context:'Обращения теряются при передаче между менеджерами.',confirmed:true,published:true}});assert.equal(task.score,10);
await post('saveTask',{task:{...task,confirmed:false}},400);
const {proposal}=await post('propose',{proposal:{taskId:task.id,teamId:'t1',idea:'Единая форма и очередь обращений.',plan:'Сначала соберём процесс, затем прототип, затем проверим.',term:'2 недели',link:'https://example.com/test-prototype'}});assert.equal(proposal.status,'pending');
await post('propose',{proposal:{...proposal,link:'javascript:alert(1)'}},400);
await post('milestone',{id:proposal.id,evidence:'Проверено 20 тестовых обращений'},400);
await post('decide',{id:proposal.id,status:'chosen'});
let m=await post('milestone',{id:proposal.id,evidence:'Проверено 20 тестовых обращений, все попали в очередь.'});assert.equal(m.proposal.milestone,true);
await post('milestone',{id:proposal.id,evidence:'Повторное подтверждение не увеличивает баллы.'});
({task}=await post('saveTask',{task:{...task,data:'Синтетические примеры обращений в CSV.',success:'Из 20 заявок не менее 18 классифицированы верно.'}}));assert.equal(task.score,45);
const reloaded=await fetch(base+'/api/workspace',{headers:{Cookie:cookie}});state=await reloaded.json();assert.equal(state.tasks.find(t=>t.id===task.id).score,45);assert.equal(state.proposals.filter(p=>p.id===proposal.id&&p.milestone).length,1);
const other=await fetch(base+'/api/workspace');const otherState=await other.json();assert.equal(otherState.tasks.some(t=>t.id===task.id),false);
const rejected=await post('decide',{id:state.proposals.find(p=>p.id!==proposal.id).id,status:'rejected'});assert.equal(rejected.proposal.status,'rejected');
console.log('PASS: черновик → вопросы → публикация с 10 баллами → отклик → ручной выбор → подтверждение; рост до 45; сохранение; изоляция; валидация.');

const stale=await fetch(base+'/api/workspace',{headers:{Cookie:'sana_session='+crypto.randomUUID()}});const restored=await stale.json();assert.equal(stale.status,200);assert.equal(restored.tasks.length,5);assert.ok(stale.headers.get('set-cookie'));console.log('PASS: stale session gets a fresh seeded workspace.');

// Regression coverage for request validation, concurrent edits and duplicate retries.
async function raw(body, extra = {}) {
  // Early request rejections may close Workerd's local HTTP connection. Keep
  // adversarial input checks independent of stale pooled sockets in Node fetch.
  const response = await fetch(base + '/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Cookie: cookie, Origin: base, ...extra }, body });
  await response.arrayBuffer();
  return response;
}
for (const body of ['null', '[]', '{']) assert.equal((await raw(body)).status, 400);
assert.equal((await raw('{}', {'Content-Type':'text/plain'})).status,415);
assert.equal((await raw(JSON.stringify({action:'saveTask',padding:'Я'.repeat(31000)}))).status,413);
assert.equal((await raw('{}',{Origin:'https://untrusted.example'})).status,403);
assert.equal((await raw(JSON.stringify({action:'saveTask',task:{title:'Orphan'}}),{Cookie:'sana_session='+crypto.randomUUID()})).status,401);
console.log('PASS: invalid JSON/type/oversized body/origin and unknown session are rejected.');

await post('saveTask',{task:{...task,revision:0}},409);
const createdAt=task.createdAt;
({task}=await post('saveTask',{task:{...task,createdAt:'2099-01-01T00:00:00Z'}}));
assert.equal(task.createdAt,createdAt);
await post('saveTask',{task:{...task,published:false}},400);
const competing=await Promise.all(['Версия A — проверка конкуренции','Версия B — проверка конкуренции'].map(title=>raw(JSON.stringify({action:'saveTask',task:{...task,title}}))));
assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
console.log('PASS: stale and simultaneous edits cannot overwrite a newer card; creation time is server-owned.');

const retryId=crypto.randomUUID();
const offer={taskId:task.id,teamId:'t2',idea:'Учебный прототип для проверки повторов.',plan:'Подготовить данные, построить прототип, проверить результат.',term:'2 недели',link:'https://example.com/retry'};
const retried=await Promise.all([post('propose',{proposal:offer,requestId:retryId}),post('propose',{proposal:offer,requestId:retryId})]);
assert.equal(retried[0].proposal.id,retried[1].proposal.id);
let after=await (await fetch(base+'/api/workspace',{headers:{Cookie:cookie}})).json();
assert.equal(after.proposals.filter(p=>p.id===retryId).length,1);
await post('propose',{proposal:{...offer,idea:'Другая идея для того же идентификатора.'},requestId:retryId},409);
await post('propose',{proposal:{...offer,link:'https://user:password@example.com'}},400);
await post('saveTask',{task:{...after.tasks.find(t=>t.id===task.id),id:otherState.tasks[0].id}},404);
await post('decide',{id:otherState.proposals[0].id,status:'chosen'},404);
console.log('PASS: a retry creates one proposal; new attempts remain allowed; cross-session writes are blocked.');

await post('decide',{id:retryId,status:'chosen'});
const racing=await Promise.all([
  raw(JSON.stringify({action:'milestone',id:retryId,evidence:'Учебный этап проверен на синтетических данных.'})),
  raw(JSON.stringify({action:'decide',id:retryId,status:'rejected'}))
]);
for(const response of racing) assert.ok([200,400,409].includes(response.status));
after=await (await fetch(base+'/api/workspace',{headers:{Cookie:cookie}})).json();
const final=after.proposals.find(p=>p.id===retryId);
if(racing[0].status===200){assert.equal(final.milestone,true);assert.equal(final.status,'chosen');}
else {assert.equal(final.milestone,false);assert.equal(final.status,'rejected');}
console.log('PASS: concurrent decision cannot erase a confirmed milestone.');
