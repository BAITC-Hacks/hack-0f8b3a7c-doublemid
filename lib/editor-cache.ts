import { blankTask, fieldDefs, topics, teams, parseAIOutput, type Task } from './domain.ts';
import type { AIQuestion } from './ai-types.ts';

export const EDITOR_CACHE_KEY = 'ai-sana-editor-v1';
export const OFFER_CACHE_KEY = 'ai-sana-offer-v1';
export type OfferDraft = { idea: string; plan: string; term: string; link: string };
export type OfferCache = { taskId: string; teamId: string; requestId: string; offer: OfferDraft };
export type EditorCache = { task: Task; step: number; maxStep: number; questions: AIQuestion[] };

export function restoreEditor(raw: string | null): EditorCache | null {
  if (!raw || raw.length > 70_000) return null;
  try {
    const saved = JSON.parse(raw), source = saved.task;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const task = blankTask();
    for (const key of ['id', 'title', 'org', 'draft', 'createdAt', ...fieldDefs.map(f => f.key)] as const) {
      if (typeof source[key] !== 'string') return null;
      task[key] = source[key].slice(0, 3000);
    }
    task.topic = topics.includes(source.topic) ? source.topic : 'Сервис';
    task.published = source.published === true;
    task.revision = Number.isSafeInteger(source.revision) && source.revision >= 0 ? source.revision : 0;
    // A browser cache can restore input, never the person's confirmation.
    task.confirmed = false;
    const questions = parseAIOutput(JSON.stringify({ questions: saved.questions }), task).questions;
    const maxStep = [0, 1, 2].includes(saved.maxStep) ? saved.maxStep : 0;
    return { task, questions, maxStep, step: [0, 1, 2].includes(saved.step) ? Math.min(saved.step, maxStep) : 0 };
  } catch { return null; }
}

export function restoreOffer(raw: string | null): OfferCache | null {
  if (!raw || raw.length > 10_000) return null;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.taskId !== 'string' || saved.taskId.length > 100 || !teams.some(t => t.id === saved.teamId)) return null;
    if (typeof saved.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(saved.requestId)) return null;
    const offer = {} as OfferDraft;
    for (const [key, max] of [['idea', 3000], ['plan', 3000], ['term', 100], ['link', 500]] as const) {
      if (typeof saved.offer?.[key] !== 'string') return null;
      offer[key] = saved.offer[key].slice(0, max);
    }
    if (!Object.values(offer).some(v => v.trim())) return null;
    return { taskId: saved.taskId, teamId: saved.teamId, requestId: saved.requestId, offer };
  } catch { return null; }
}
