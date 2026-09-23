import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:4173';
const first=await fetch(base+'/api/workspace');assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0];
let state=await first.json();assert.equal(state.tasks.length,5);assert.equal(state.proposals.length,5);
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
