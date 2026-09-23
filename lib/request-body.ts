export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// Bound the actual stream: Content-Length can be absent or inaccurate.
export async function readRequestBody(request: Request, limit = 60_000): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestBodyError('Ожидается запрос в формате JSON.', 415);
  }
  if (!request.body) throw new RequestBodyError('Пустой запрос.', 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestBodyError('Слишком большой запрос.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let result: unknown;
  try { result = JSON.parse(text); } catch { throw new RequestBodyError('Некорректный JSON.', 400); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new RequestBodyError('Ожидается объект запроса.', 400);
  }
  return result as Record<string, unknown>;
}
