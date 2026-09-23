import assert from 'node:assert/strict';
import { blankTask, fieldDefs, scoreTask, readiness, seedTasks, questionsFor, parseAIOutput } from '../lib/domain.ts';
assert.deepEqual(seedTasks.map(t=>t.score),[100,85,70,45,20]);
const full={...blankTask(),confirmed:true};for(const f of fieldDefs)full[f.key]='Проверенные сведения для работы';
assert.equal(scoreTask(full),100);assert.equal(scoreTask({...full,confirmed:false}),0);
assert.equal(scoreTask({...full,data:''}),80);assert.equal(scoreTask({...full,data:'не знаю'}),80);
for(const [n,s] of [[0,'Требует уточнения'],[39,'Требует уточнения'],[40,'Рабочая'],[69,'Рабочая'],[70,'Готовая'],[89,'Готовая'],[90,'Приоритетная'],[100,'Приоритетная']])assert.equal(readiness(n),s);
assert.ok(questionsFor(full).length>=3);
assert.ok(questionsFor({...blankTask(),draft:'Автоматизировать заявки'}).some(q=>q.text.includes('обезличенные примеры заявок')));
for(const raw of ['not json','{}','{"questions":[]}','{"questions":[{"key":"unknown","text":"x"}]}']){const r=parseAIOutput(raw,full);assert.equal(r.fallback,true);assert.ok(r.questions.length>=3);}
assert.equal(parseAIOutput(JSON.stringify({questions:questionsFor(full)}),full).fallback,false);
console.log('PASS: рейтинг, границы уровней, минимум 3 вопроса, некорректный AI-ответ.');
