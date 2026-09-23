// Deliberately separate from offline tests. Makes one paid request only with explicit opt-in.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { generateQuestions } from '../lib/openai-questions.ts';
if (!process.argv.includes('--allow-paid-request')) {
  console.error('No request made. Explicit approval and --allow-paid-request are required.');
  process.exit(2);
}
const local = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
if (!local.OPENAI_API_KEY?.trim()) { console.error('No key configured. No request made.'); process.exit(2); }
const result = await generateQuestions({ draft: 'Учебный кейс: заявки клиентов теряются при ручном переносе из почты в таблицу. Хотим автоматизировать обработку.', topic: 'Сервис' },
  { apiKey: local.OPENAI_API_KEY, enabled: 'true', model: local.OPENAI_MODEL || 'gpt-5.4-mini' });
console.log(JSON.stringify({ mode: result.mode, reason: result.reason, model: result.model, questions: result.questions }, null, 2));
if (result.mode !== 'openai') process.exitCode = 1;
