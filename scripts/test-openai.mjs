import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuestions, questionInput, MAX_OUTPUT_TOKENS } from '../lib/openai-questions.ts';
import { blankTask, questionsFor } from '../lib/domain.ts';

const task = { ...blankTask(), draft: 'Хотим автоматизировать заявки клиентов.', contact: 'private-contact@example.com' };
const config = { apiKey: 'fake-test-key', enabled: 'true', model: 'gpt-5.4-mini' };
const result = questionsFor(task).slice(0, 3);
const completed = (content) => Response.json({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content }] });
const valid = () => completed([{ type: 'output_text', text: JSON.stringify({ questions: result }) }]);
const forbidden = async () => { throw Error('Unexpected network request'); };

test('disabled and missing-key modes make zero external requests', async () => {
  let calls = 0;
  const noNetwork = async () => { calls++; return valid(); };
  assert.equal((await generateQuestions(task, { ...config, enabled: 'false' }, noNetwork)).reason, 'disabled');
  assert.equal((await generateQuestions(task, { enabled: 'true' }, noNetwork)).reason, 'missing_key');
  assert.equal(calls, 0);
});
test('request uses a strict schema, token cap, no storage and excludes the contact value', async () => {
  let calls = 0;
  const output = await generateQuestions(task, config, async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.4-mini'); assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, MAX_OUTPUT_TOKENS);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.properties.questions.minItems, 3);
    assert.ok(!options.body.includes(task.contact)); assert.ok(!options.body.includes(config.apiKey));
    assert.equal(options.headers.Authorization, 'Bearer fake-test-key');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return valid();
  });
  assert.equal(calls, 1); assert.equal(output.mode, 'openai'); assert.deepEqual(output.questions, result);
  assert.ok(!JSON.stringify(output).includes(config.apiKey));
});
test('input is bounded and contact content is never included', () => {
  const input = questionInput({ ...task, draft: 'а'.repeat(9999), data: 'д'.repeat(9999) });
  assert.equal(input.draft.length, 3000); assert.equal(input.fields.data.length, 700);
  assert.ok(!JSON.stringify(input).includes(task.contact));
});
for (const [status, code, reason] of [[401,'invalid_api_key','auth'],[403,'','auth'],[404,'model_not_found','auth'],[429,'insufficient_quota','quota'],[429,'rate_limit_exceeded','rate_limit'],[500,'','unavailable']]) {
  test(`HTTP ${status} ${code} yields a safe ${reason} fallback without retry`, async () => {
    let calls=0; const output=await generateQuestions(task,config,async()=>{calls++;return Response.json({error:{code,message:'Do not show upstream details'}},{status});});
    assert.equal(output.reason,reason);assert.equal(output.mode,'demo');assert.ok(output.questions.length>=3);assert.equal(calls,1);
    assert.ok(!JSON.stringify(output).includes('upstream'));
  });
}
test('timeout produces fallback', async () => {
  const output=await generateQuestions(task,config,async()=>{throw new DOMException('timeout','TimeoutError')});
  assert.equal(output.reason,'timeout');
});
test('network failure produces fallback', async () => { assert.equal((await generateQuestions(task,config,forbidden)).reason,'unavailable'); });
test('refusal produces fallback', async () => { assert.equal((await generateQuestions(task,config,async()=>completed([{type:'refusal',refusal:'No'}]))).reason,'refusal'); });
test('incomplete responses do not become success', async () => {
  assert.equal((await generateQuestions(task,config,async()=>Response.json({status:'incomplete',output:[]}))).reason,'invalid_response');
});
for (const text of ['not JSON','{"questions":[]}',JSON.stringify({questions:[result[0],result[0],result[0]]}),JSON.stringify({questions:[{key:'unknown',text:'Invalid question'},...result.slice(1)]})]) {
  test('reject invalid structured content: '+text.slice(0,40),async()=>{assert.equal((await generateQuestions(task,config,async()=>completed([{type:'output_text',text}]))).reason,'invalid_response');});
}
