import type { FieldKey } from './domain';

export type AIQuestion = { key: FieldKey; text: string };
export type AIReason = 'disabled' | 'missing_key' | 'auth' | 'quota' | 'rate_limit' | 'unavailable' | 'timeout' | 'invalid_response' | 'refusal';
export type AIStatus = { enabled: boolean; keyConfigured: boolean; model: string };
export type AIResult = { questions: AIQuestion[]; mode: 'openai' | 'demo'; fallback: boolean; reason?: AIReason; model?: string };

export function aiNotice(status: AIStatus | null, result: AIResult | null): string {
  if (result?.mode === 'openai') return 'Вопросы подготовлены OpenAI · ' + result.model + '. Проверьте их и ответьте своими словами.';
  if (result?.fallback) {
    const messages: Record<AIReason, string> = {
      disabled: 'Реальные AI-запросы выключены.', missing_key: 'Ключ OpenAI не настроен.',
      auth: 'OpenAI не подтвердил доступ к модели или ключу.', quota: 'Достигнут лимит расходов или исчерпаны API-кредиты.',
      rate_limit: 'Достигнут лимит частоты запросов. Попробуйте позже.', unavailable: 'OpenAI временно недоступен.',
      timeout: 'OpenAI не ответил вовремя.', invalid_response: 'Ответ AI не прошёл проверку.', refusal: 'AI не смог обработать этот запрос.',
    };
    return (messages[result.reason || 'unavailable']) + ' Показаны резервные вопросы; ваши ответы сохранены в форме.';
  }
  if (!status) return 'Проверяем доступность AI-помощника…';
  if (!status.enabled) return 'Демо-режим: вопросы по правилам. Реальные запросы к OpenAI выключены.';
  if (!status.keyConfigured) return 'Демо-режим: серверный ключ OpenAI не настроен.';
  return 'OpenAI · ' + status.model + '. При уточнении описание и ответы будут отправлены модели. Не добавляйте конфиденциальные данные.';
}
