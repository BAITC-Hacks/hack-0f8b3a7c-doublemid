"use client";
import { ArrowUpRight, Check, ExternalLink, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fieldDefs, isFilled, level, readiness, scoreTask, teams, type Task, type Proposal } from '@/lib/domain';
import { plural } from '@/lib/format';

export function Picker({ value, onChange, items, label, disabled = false }: {
  value: string; onChange: (value: string) => void; items: { value: string; label: string }[]; label: string; disabled?: boolean;
}) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>;
}

export function Rating({ task }: { task: Task }) {
  const score = scoreTask(task, true), filled = fieldDefs.filter(f => isFilled(task[f.key])).length;
  return <aside className="surface rating-aside" aria-label="Оценка готовности">
    <div className="section-label">ГОТОВНОСТЬ ЗАДАЧИ</div>
    <div className="big-score">{score}<small> / 100</small></div>
    <span className={'readiness ' + level(score)}>{readiness(score)}</span>
    <Progress value={score} aria-label="Предварительный рейтинг готовности" className="my-5 h-1.5" />
    <p className="help">Заполнено {filled} из {fieldDefs.length} полей</p>
    <div className="score-breakdown">{fieldDefs.map(field => <div className="score-row" key={field.key}>
      <span>{field.label}</span><b className={isFilled(task[field.key]) ? 'earned' : ''}>{isFilled(task[field.key]) ? field.points : 0}<small> / {field.points}</small></b>
    </div>)}</div>
    <p className="help">Предварительная оценка полноты. Итог фиксируется после подтверждения сведений.</p>
    {filled < fieldDefs.length && <div className="next-step"><b>Что уточнить дальше</b><p>{fieldDefs.find(f => !isFilled(task[f.key]))?.question}</p></div>}
  </aside>;
}

export function TaskList({ tasks, proposals, onOpen, disabled }: { tasks: Task[]; proposals: Proposal[]; onOpen: (id: string) => void; disabled?: boolean }) {
  return <div className="task-register">
    <div className="register-head" aria-hidden="true"><span>Задача / организация</span><span>Направление</span><span>Готовность</span><span>Отклики</span><span /></div>
    <ul className="task-list" aria-label="Список задач">{tasks.map(task => {
      const count = task.proposalCount ?? proposals.filter(p => p.taskId === task.id).length;
      return <li key={task.id}><button disabled={disabled} className="task-row" aria-label={'Открыть задачу: ' + task.title} onClick={() => onOpen(task.id)}>
        <span className="task-main"><span className="task-title">{task.title}</span><span className="task-org">{task.org || 'Организация не указана'}</span><span className="task-summary">{task.need || task.context || task.draft}</span></span>
        <span className="topic-label">{task.topic}</span>
        <span className="task-readiness"><span className="score-value">{task.score}<small> / 100</small></span><span className={'readiness ' + (task.published ? level(task.score) : 'unpublished')}>{task.published ? readiness(task.score) : 'Черновик'}</span><Progress value={task.score} aria-label={`Готовность ${task.score} из 100`} className="h-1" /></span>
        <span className="task-offers"><b>{count}</b><span className="mobile-label">{plural(count, ['отклик', 'отклика', 'откликов'])}</span></span><ArrowUpRight className="row-arrow" size={18} aria-hidden="true" />
      </button></li>;
    })}</ul>
  </div>;
}

export function ProposalCard({ proposal: p, task, business, busy, onOpen, onDecide, onMilestone }: {
  proposal: Proposal; task?: Task; business: boolean; busy: boolean; onOpen: (id: string) => void;
  onDecide: (proposal: Proposal, status: 'chosen' | 'rejected') => void; onMilestone: (id: string) => void;
}) {
  const team = teams.find(t => t.id === p.teamId)!;
  return <article className="proposal" aria-label={`Отклик ${team.name}: ${task?.title || 'Задача'}`}>
    <div className="proposal-title"><div className="team-identity"><span className="profile-badge">{team.initials}</span><div><h3>{team.name}</h3><p className="subtle">{team.skills}</p></div></div><span className={'status ' + (p.milestone ? 'completed' : p.status)}>{p.milestone ? 'Этап подтверждён' : { pending: 'На рассмотрении', chosen: 'Команда выбрана', rejected: 'Отклонено' }[p.status]}</span></div>
    <button className="task-reference" disabled={busy} onClick={() => onOpen(p.taskId)}>{task?.title}</button>
    <dl className="proposal-details"><div><dt>Идея</dt><dd>{p.idea}</dd></div><div><dt>План</dt><dd>{p.plan}</dd></div></dl>
    <div className="proposal-meta"><span>Срок: <b>{p.term}</b></span><a href={p.link} target="_blank" rel="noopener noreferrer">Прототип <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (откроется в новой вкладке)</span></a></div>
    {p.evidenceSubmittedAt && !p.milestone && <div className="result-note"><FileCheck2 size={18} /><div><b>Результат отправлен на проверку</b><p>{p.evidence}</p></div></div>}
    {p.milestone && <div className="result-note"><FileCheck2 size={18} aria-hidden="true" /><div><b>Этап подтверждён · +20 баллов</b><p>{p.evidence}</p></div></div>}
    {business && !p.milestone && <div className="actions">
      {p.status !== 'rejected' && <Button variant="outline" disabled={busy} onClick={() => onDecide(p, 'rejected')}>Отклонить</Button>}
      {p.status !== 'chosen' ? <Button disabled={busy} onClick={() => onDecide(p, 'chosen')}><Check size={16} />Выбрать команду</Button> : <Button disabled={busy || !p.evidenceSubmittedAt} onClick={() => onMilestone(p.id)}>{p.evidenceSubmittedAt ? 'Проверить и подтвердить этап' : 'Ожидаем результат команды'}</Button>}
    </div>}
    {!business && p.status === 'chosen' && !p.milestone && <div className="actions"><Button disabled={busy} onClick={() => onMilestone(p.id)}>{p.evidenceSubmittedAt ? 'Уточнить отчёт' : 'Отправить результат этапа'}</Button></div>}
  </article>;
}
