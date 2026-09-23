import assert from 'node:assert/strict';
import test from 'node:test';
import { readRequestBody } from '../lib/request-body.ts';
import { restoreEditor, restoreOffer } from '../lib/editor-cache.ts';
import { blankTask, questionsFor } from '../lib/domain.ts';

const request = (body, type = 'application/json') => new Request('http://localhost/test', { method: 'POST', headers: { 'Content-Type': type }, body });
test('accepts a valid JSON object', async () => assert.deepEqual(await readRequestBody(request('{"action":"questions"}')), { action: 'questions' }));
test('rejects malformed JSON and non-object payloads as client errors', async () => {
  for (const body of ['{', 'null', '[]', '42']) await assert.rejects(readRequestBody(request(body)), e => e.status === 400);
});
test('rejects incorrect media type', async () => assert.rejects(readRequestBody(request('{}', 'text/plain')), e => e.status === 415));
test('limits streamed bytes without relying on content-length', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"value":"')); controller.enqueue(new TextEncoder().encode('Я'.repeat(100))); controller.close(); } });
  const input = new Request('http://localhost/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
  await assert.rejects(readRequestBody(input, 100), e => e.status === 413);
});
test('restores input and step, but never restores human confirmation', () => {
  const task = { ...blankTask(), draft: 'Проверочный черновик с данными', confirmed: true, published: true, revision: 3 };
  const saved = restoreEditor(JSON.stringify({ task, step: 2, maxStep: 2, questions: questionsFor(task) }));
  assert.equal(saved.task.draft, task.draft); assert.equal(saved.step, 2); assert.equal(saved.task.confirmed, false); assert.equal(saved.task.revision, 3);
});
test('invalid or oversized browser cache does not break the editor', () => {
  for (const value of [null, 'broken', '{}', '{"task":[]}', 'x'.repeat(70001)]) assert.equal(restoreEditor(value), null);
});
test('restored navigation cannot skip beyond the completed step', () => {
  const saved = restoreEditor(JSON.stringify({ task: blankTask(), step: 2, maxStep: 0, questions: [] }));
  assert.equal(saved.step, 0); assert.ok(saved.questions.length >= 3);
});
test('restores offer text and the same idempotency key after reload', () => {
  const value = {taskId:'task-1',teamId:'t1',requestId:crypto.randomUUID(),offer:{idea:'Незавершённый отклик',plan:'',term:'',link:''}};
  assert.deepEqual(restoreOffer(JSON.stringify(value)),value);
});
test('invalid offer cache and unknown team cannot restore a form', () => {
  for (const value of [null,'{}','not json',JSON.stringify({taskId:'task-1',teamId:'unknown',requestId:crypto.randomUUID(),offer:{idea:'x',plan:'',term:'',link:''}})]) assert.equal(restoreOffer(value),null);
});
