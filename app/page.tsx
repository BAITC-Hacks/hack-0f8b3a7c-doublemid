"use client";
import { Login } from '@/components/hub/login';
import { Dashboard, type Standing } from '@/components/hub/dashboard';
import type { Account } from '@/lib/auth-types';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, Loader2, Plus, Search, SlidersHorizontal, CircleHelp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Picker, Rating, TaskList, ProposalCard } from '@/components/hub/workspace-ui';
import { aiNotice, type AIResult, type AIStatus, type AIQuestion } from '@/lib/ai-types';
import { plural } from '@/lib/format';
import { EDITOR_CACHE_KEY, OFFER_CACHE_KEY, restoreEditor, restoreOffer } from '@/lib/editor-cache';
import { fieldDefs, teams, topics, blankTask, readiness, level, isFilled, seedDrafts, questionsFor, type Task, type Proposal } from '@/lib/domain';

type Offer = { idea: string; plan: string; term: string; link: string };
const blankOffer = (): Offer => ({ idea: '', plan: '', term: '', link: '' });
const proposalFilters = [{ value: 'all', label: 'Все' }, { value: 'pending', label: 'На рассмотрении' }, { value: 'chosen', label: 'Выбраны' }, { value: 'completed', label: 'Этап завершён' }, { value: 'rejected', label: 'Отклонены' }];
const offerStatus = (p: Proposal) => p.milestone ? 'completed' : p.status;

export default function Home() {
  const [ai, setAI] = useState<AIStatus | null>(null), [aiResult, setAIResult] = useState<AIResult | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]), [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const busyRef = useRef(false), offerRequestId = useRef('');
  const [account, setAccount] = useState<Account | null>(null), [demo, setDemo] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]), [tab, setTab] = useState('dashboard');
  const [compare, setCompare] = useState(false);
  const team = account?.teamId || 't1';
  const [query, setQuery] = useState(''), [topic, setTopic] = useState('all'), [ready, setReady] = useState('all'), [proposalFilter, setProposalFilter] = useState('all');
  const [draft, setDraft] = useState<Task>(blankTask), [step, setStep] = useState(0), [maxStep, setMaxStep] = useState(0);
  const [questions, setQuestions] = useState<AIQuestion[]>([]), [confirmed, setConfirmed] = useState(false), [dirty, setDirty] = useState(false);
  const [cacheReady, setCacheReady] = useState(false), [cacheAvailable, setCacheAvailable] = useState(true);
  const [selected, setSelected] = useState<string | null>(null), [apply, setApply] = useState(false), [offer, setOffer] = useState<Offer>(blankOffer);
  const [milestone, setMilestone] = useState<string | null>(null), [evidence, setEvidence] = useState('');
  const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);
  const task = tasks.find(t => t.id === selected), activeTeam = teams.find(t => t.id === team)!;
  const business = account?.role === 'business';

  async function load() {
    try {
      const response = await fetch('/api/workspace', { signal: AbortSignal.timeout(15000) });
      const data = await response.json() as { error?: string; tasks: Task[]; proposals: Proposal[]; ai: AIStatus; account: Account; leaderboard: Standing[] };
      if (response.status === 401) { setAccount(null); setTasks([]); setProposals([]); return; }
      if (!response.ok) throw Error(data.error || 'Не удалось загрузить данные.');
      setTasks(data.tasks); setProposals(data.proposals); setAI(data.ai); setAccount(data.account); setStandings(data.leaderboard);
      return data;
    } catch (e) { setError(e instanceof Error && !['TypeError', 'TimeoutError'].includes(e.name) ? e.message : 'Нет связи с сервером. Повторите загрузку.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      let workspace;
      try {
        const res = await fetch('/api/auth', { signal: AbortSignal.timeout(15000) });
        const auth = await res.json() as { account: Account | null; demo: boolean; error?: string };
        if (!res.ok) throw Error(auth.error);
        setDemo(auth.demo);
        if (auth.account) workspace = await load(); else setLoading(false);
      } catch { setError('Не удалось загрузить аккаунт. Проверьте запуск сервера и миграции базы.'); setLoading(false); }
      if (cancelled) return;
      try {
        const saved = restoreEditor(sessionStorage.getItem(EDITOR_CACHE_KEY));
        if (saved && workspace?.account.role === 'business') { setDraft(saved.task); setQuestions(saved.questions); setStep(saved.step); setMaxStep(saved.maxStep); setDirty(true); }
        const savedOffer = restoreOffer(sessionStorage.getItem(OFFER_CACHE_KEY));
        if (savedOffer && workspace?.account.role === 'student' && workspace.account.teamId === savedOffer.teamId && workspace.tasks.some(t => t.id === savedOffer.taskId && t.published)) {
          setOffer(savedOffer.offer);
          offerRequestId.current = savedOffer.requestId; setSelected(savedOffer.taskId); setApply(true);
        }
      } catch { setCacheAvailable(false); }
      setCacheReady(true);
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!cacheReady) return;
    function persist() {
      try {
        if (dirty) sessionStorage.setItem(EDITOR_CACHE_KEY, JSON.stringify({ task: draft, step, maxStep, questions }));
        else sessionStorage.removeItem(EDITOR_CACHE_KEY);
      } catch { setCacheAvailable(false); }
    }
    // Commit browser storage after paint; flush pending input when navigating away.
    const frame = requestAnimationFrame(persist);
    window.addEventListener('pagehide', persist);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pagehide', persist); };
  }, [draft, step, maxStep, questions, dirty, cacheReady]);
  useEffect(() => {
    if (!cacheReady) return;
    function persist() {
      try {
        if (apply && selected && Object.values(offer).some(v => v.trim())) {
          sessionStorage.setItem(OFFER_CACHE_KEY, JSON.stringify({ taskId: selected, teamId: team, requestId: offerRequestId.current, offer }));
        } else sessionStorage.removeItem(OFFER_CACHE_KEY);
      } catch { setCacheAvailable(false); }
    }
    const frame = requestAnimationFrame(persist);
    window.addEventListener('pagehide', persist);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pagehide', persist); };
  }, [offer, apply, selected, team, cacheReady]);
  useEffect(() => {
    document.getElementById('page-title')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [tab, step]);
  async function api(action: string, payload: Record<string, unknown>) {
    let response: Response;
    try { response = await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(25000) }); }
    catch { throw Error('Не удалось получить ответ сервера. Ввод сохранён в форме. Проверьте связь и обновите данные перед повторной отправкой.'); }
    let data: { error?: string; task: Task; proposal: Proposal } & AIResult;
    try { data = await response.json(); } catch { throw Error('Сервис временно недоступен. Ввод сохранён в форме.'); }
    if (!response.ok) throw Error(data.error || 'Не удалось сохранить изменения.');
    return data;
  }
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { const message = e instanceof Error ? e.message : 'Не удалось выполнить действие.'; setError(message); toast.error(message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function editField(key: keyof Task, value: string) {
    setDraft(previous => ({ ...previous, [key]: value, ...(key === 'draft' && previous.context === previous.draft ? { context: value } : {}), confirmed: false }));
    setDirty(true); setConfirmed(false);
  }
  function guardEditor(action: () => void) {
    if (dirty) setPendingAction({ message: 'В форме есть несохранённые изменения. Вернитесь к ней и сохраните черновик или продолжите без этих изменений.', action });
    else action();
  }
  function startNew() { guardEditor(() => { setDraft(blankTask()); setQuestions([]); setAIResult(null); setStep(0); setMaxStep(0); setConfirmed(false); setDirty(false); setError(''); setSelected(null); setTab('builder'); }); }
  function openTask(id: string) { setSelected(id); setApply(false); setError(''); }
  function editTask(value: Task) { guardEditor(() => { setDraft({ ...value }); setQuestions(questionsFor(value)); setAIResult(null); setStep(2); setMaxStep(2); setConfirmed(false); setDirty(false); setSelected(null); setError(''); setTab('builder'); }); }
  function closeTask() {
    if (busyRef.current) return;
    if (apply && Object.values(offer).some(v => v.trim())) setPendingAction({ message: 'Отклик ещё не отправлен. Вернитесь к форме, чтобы закончить его, или закройте без сохранения.', action: () => { setSelected(null); setApply(false); setOffer(blankOffer()); } });
    else { setSelected(null); setApply(false); setError(''); }
  }
  async function logout() {
    await run(async () => {
      const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      if (!res.ok) throw Error('Не удалось выйти. Повторите попытку.');
      setAccount(null); setTasks([]); setProposals([]); setStandings([]); setDraft(blankTask()); setDirty(false); setSelected(null); setApply(false); setOffer(blankOffer()); setTab('dashboard'); setProposalFilter('all'); setConfirmed(false); clearFilters();
      try { sessionStorage.removeItem(EDITOR_CACHE_KEY); sessionStorage.removeItem(OFFER_CACHE_KEY); } catch {}
    });
  }
  function clearFilters() { setQuery(''); setTopic('all'); setReady('all'); }
  async function ask() {
    await run(async () => {
      const next = { ...draft, context: draft.context || draft.draft };
      const result = await api('questions', { task: next });
      setQuestions(result.questions); setAIResult(result); setDraft(next); setDirty(true); setStep(1); setMaxStep(value => Math.max(value, 1)); setConfirmed(false);
    });
  }
  async function save(publish: boolean) {
    await run(async () => {
      if (publish && !confirmed) throw Error('Подтвердите проверку сведений.');
      const result = await api('saveTask', { task: { ...draft, title: draft.title.trim() || draft.draft.slice(0, 80), confirmed: publish && confirmed, published: publish } });
      setTasks(values => [result.task, ...values.filter(t => t.id !== result.task.id)]);
      setDraft(blankTask()); setStep(0); setMaxStep(0); setDirty(false); setQuestions([]); setConfirmed(false); setAIResult(null);
      clearFilters(); setTab(publish ? 'catalog' : 'mine');
      if (publish) openTask(result.task.id);
      toast.success(publish ? 'Задача опубликована в каталоге' : 'Черновик сохранён');
    });
  }
  async function decide(p: Proposal, status: 'chosen' | 'rejected') {
    await run(async () => {
      const result = await api('decide', { id: p.id, status });
      setProposals(values => values.map(value => value.id === p.id ? result.proposal : value));
      toast.success(status === 'chosen' ? 'Команда выбрана. Можно выбрать и другие команды.' : 'Предложение отклонено');
    });
  }
  function startOffer() { offerRequestId.current = crypto.randomUUID(); setOffer(blankOffer()); setApply(true); setError(''); }
  async function submitOffer() {
    if (!task) return;
    await run(async () => {
      const result = await api('propose', { requestId: offerRequestId.current, proposal: { ...offer, teamId: team, taskId: task.id } });
      setProposals(values => [result.proposal, ...values.filter(p => p.id !== result.proposal.id)]);
      setOffer(blankOffer()); setApply(false); setSelected(null); setProposalFilter('all'); setTab('offers'); toast.success('Предложение отправлено бизнесу');
    });
  }
  async function confirmMilestone() {
    await run(async () => {
      const result = await api(business ? 'milestone' : 'submitProgress', { id: milestone, evidence });
      setProposals(values => values.map(p => p.id === milestone ? result.proposal : p)); setMilestone(null); setEvidence(''); toast.success(business ? 'Этап подтверждён. Команде начислено 20 баллов.' : 'Результат отправлен бизнесу на проверку.'); void load();
    });
  }
  const visible = tasks.filter(t => t.published && (topic === 'all' || t.topic === topic) && (ready === 'all' || level(t.score) === ready) && `${t.title} ${t.org} ${t.need} ${t.context}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
  const ownProposals = business ? proposals : proposals.filter(p => p.teamId === team);
  const shownProposals = ownProposals.filter(p => proposalFilter === 'all' || offerStatus(p) === proposalFilter);
  const published = tasks.filter(t => t.published);
  const filtersActive = Boolean(query || topic !== 'all' || ready !== 'all');
  const errorNotice = error ? <div className="error" role="alert"><span>{error}</span><Button variant="outline" size="sm" disabled={busy || loading} onClick={() => { setLoading(true); setError(''); void load(); }}><RotateCcw size={14} />Обновить данные</Button></div> : null;
  const renderProposal = (p: Proposal) => <ProposalCard key={p.id} proposal={p} task={tasks.find(t => t.id === p.taskId)} business={business} busy={busy} onOpen={openTask} onDecide={(item, status) => void decide(item, status)} onMilestone={id => { setError(''); setMilestone(id); setEvidence(proposals.find(p => p.id === id)?.evidence || ''); }} />;
  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options?: unknown) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try { Promise.resolve(context.registerTool({ name: 'filter_task_catalog', title: 'Фильтровать каталог задач', description: 'Показывает опубликованные задачи по теме и уровню готовности. Не меняет данные.', inputSchema: { type: 'object', properties: { topic: { type: 'string', enum: ['all', ...topics] }, level: { type: 'string', enum: ['all', 'draft', 'working', 'ready', 'priority'] } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => {
      const p = input as { topic?: string; level?: string };
      if (!p || typeof p !== 'object' || (p.topic && !['all', ...topics].includes(p.topic)) || (p.level && !['all', 'draft', 'working', 'ready', 'priority'].includes(p.level))) throw Error('Неизвестный фильтр');
      setTopic(p.topic || 'all'); setReady(p.level || 'all'); setQuery(''); setTab('catalog');
      return { tasks: tasks.filter(t => t.published && (!p.topic || p.topic === 'all' || t.topic === p.topic) && (!p.level || p.level === 'all' || level(t.score) === p.level)).map(t => ({ title: t.title, score: t.score })) };
    } }, { signal: controller.signal })).catch(() => {}); } catch { /* Optional browser integration. */ }
    return () => controller.abort();
  }, [tasks]);
  useEffect(() => {
    if (!account?.id) return;
    const refresh = () => { if (!busyRef.current && document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [account?.id]);
  if (loading && !account) return <div className="auth-loading"><span className="brand-symbol">S</span><p>Открываем AI Sana…</p></div>;
  if (!account) return <>{error && <div role="alert" className="auth-error">{error} <button onClick={() => window.location.reload()}>Повторить</button></div>}<Login demo={demo} onLogin={async () => { setError(''); await load(); setTab('dashboard'); }} /></>;
  return <div className="app">
    <Toaster position="bottom-right" />
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <header className="topbar"><div className="topbar-inner">
      <button className="brand" onClick={() => setTab('catalog')} disabled={busy} aria-label="AI Sana — каталог задач"><span className="brand-symbol" aria-hidden="true">S</span><span><strong>AI Sana</strong><small>Challenge Hub</small></span></button>
      <div className="owner">МНВО<span>Практические задачи бизнеса</span></div>
      <div className="role-control"><span className="account-role">{business ? 'Бизнес / администратор' : 'Студенческая команда'}</span><span className="account-name">{account.name}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => { if (dirty || (apply && Object.values(offer).some(Boolean))) setPendingAction({ message: 'Сохраните черновик перед выходом или продолжите без сохранения.', action: () => void logout() }); else void logout(); }}>Выйти</Button></div>
    </div></header>
    <div className="navigation"><Tabs value={tab} onValueChange={value => { setTab(value); setError(''); }}><TabsList variant="line" aria-label="Разделы приложения">
      <TabsTrigger disabled={busy} value="dashboard">Обзор</TabsTrigger><TabsTrigger disabled={busy} value="catalog">Каталог задач</TabsTrigger>{business && <TabsTrigger disabled={busy} value="mine">Мои задачи</TabsTrigger>}
      <TabsTrigger disabled={busy} value="offers">{business ? 'Отклики команд' : 'Мои отклики'}<span className="nav-count">{loading ? '—' : ownProposals.length}</span></TabsTrigger>
      <TabsTrigger disabled={busy} value="guide">Как это работает</TabsTrigger>{tab === 'builder' && <TabsTrigger disabled={busy} value="builder">Конструктор</TabsTrigger>}
    </TabsList></Tabs></div>
    <main className="workspace" id="main-content" aria-busy={loading || busy}>
      {!task && !milestone && errorNotice}
      {business && dirty && tab !== 'builder' && <div className="draft-banner"><div><b>Есть незавершённая карточка</b><span>{draft.title || draft.draft.slice(0, 100) || 'Продолжите заполнение задачи'}</span></div><Button variant="outline" onClick={() => { setTab('builder'); setError(''); }}>Продолжить заполнение<ArrowRight size={15} /></Button></div>}
      {tab === 'dashboard' && <Dashboard account={account} tasks={tasks} proposals={proposals} standings={standings} onNavigate={setTab} onCreate={startNew} onOpen={openTask} busy={busy || loading} />}
      {tab === 'catalog' && <>
        <div className="page-heading"><div><div className="section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><h1 id="page-title" tabIndex={-1}>Каталог задач</h1><p>Запросы бизнеса, открытые для предложений команд.</p></div>{business && <Button disabled={loading || busy || !cacheReady} onClick={startNew}><Plus size={17} />Создать задачу</Button>}</div>
        <dl className="overview"><div><dt>Опубликовано</dt><dd>{loading ? '—' : published.length}<small>{plural(published.length, ['задача', 'задачи', 'задач'])}</small></dd></div><div><dt>Готовы к работе <span title="Готовность от 70 баллов">≥ 70</span></dt><dd>{loading ? '—' : published.filter(t => t.score >= 70).length}<small>{plural(published.filter(t => t.score >= 70).length, ['задача', 'задачи', 'задач'])}</small></dd></div><div><dt>{business ? 'На рассмотрении' : 'Ваши отклики'}</dt><dd>{loading ? '—' : business ? proposals.filter(p => p.status === 'pending').length : ownProposals.length}<small>{plural(business ? proposals.filter(p => p.status === 'pending').length : ownProposals.length, ['отклик', 'отклика', 'откликов'])}</small></dd></div><div><dt>Участвуют</dt><dd>{teams.length}<small>команд</small></dd></div></dl>
        <section className="catalog-section" aria-label="Поиск и список задач">
          <div className="toolbar"><div className="search-field"><Search size={17} aria-hidden="true" /><Input aria-label="Поиск задач" placeholder="Поиск по задачам и организациям" value={query} onChange={e => setQuery(e.target.value)} /></div><Picker label="Тема" value={topic} onChange={setTopic} items={[{ value: 'all', label: 'Все направления' }, ...topics.map(value => ({ value, label: value }))]} /><Picker label="Уровень готовности" value={ready} onChange={setReady} items={[{ value: 'all', label: 'Любая готовность' }, { value: 'priority', label: '90–100 · Приоритетная' }, { value: 'ready', label: '70–89 · Готовая' }, { value: 'working', label: '40–69 · Рабочая' }, { value: 'draft', label: '0–39 · Уточнить' }]} />{filtersActive && <Button variant="ghost" onClick={clearFilters}>Сбросить</Button>}</div>
          <div className="list-caption"><span aria-live="polite">{loading ? 'Загружаем задачи…' : `Найдено: ${visible.length}`}</span><span><SlidersHorizontal size={14} aria-hidden="true" />По готовности: сначала выше</span></div>
          {loading ? <div className="loading-list" aria-label="Загрузка задач">{[1, 2, 3].map(n => <Skeleton key={n} className="h-24 rounded-md" />)}</div> : visible.length ? <TaskList tasks={visible} proposals={proposals} onOpen={openTask} disabled={busy} /> : <div className="empty-state"><Search size={24} /><h2>{error ? 'Данные недоступны' : 'Нет задач по этим условиям'}</h2><p>{error ? 'Повторите загрузку с помощью кнопки выше.' : 'Измените запрос или сбросьте фильтры.'}</p>{filtersActive && <Button variant="outline" onClick={clearFilters}>Сбросить фильтры</Button>}</div>}
        </section><p className="catalog-note"><CircleHelp size={15} aria-hidden="true" />Готовность показывает полноту описания. Отклик доступен при любом балле.</p>
      </>}
      {tab === 'mine' && business && <>
        <div className="page-heading"><div><div className="section-label">БИЗНЕС</div><h1 id="page-title" tabIndex={-1}>Мои задачи</h1><p>Черновики и опубликованные запросы в вашем рабочем пространстве.</p></div><Button disabled={busy || loading} onClick={startNew}><Plus size={17} />Новая задача</Button></div>
        <TaskList tasks={[...tasks].sort((a, b) => Number(a.published) - Number(b.published) || b.createdAt.localeCompare(a.createdAt))} proposals={proposals} onOpen={openTask} disabled={busy} />
      </>}
      {tab === 'builder' && business && <>
        <div className="page-heading"><div><div className="section-label">{draft.id ? 'РЕДАКТИРОВАНИЕ ЗАДАЧИ' : 'НОВАЯ ЗАДАЧА'}</div><h1 id="page-title" tabIndex={-1}>{['Описание задачи', 'Уточнение деталей', 'Проверка и публикация'][step]}</h1><p>{['Опишите текущую проблему и желаемые изменения.', 'Ответьте на вопросы. Неизвестные сведения можно оставить пустыми.', 'Проверьте формулировки и подтвердите сведения перед публикацией.'][step]}</p></div><span className="save-status">{dirty ? cacheAvailable ? 'Ввод сохранён в этой вкладке' : 'Сохраните черновик перед выходом' : 'Изменений нет'}</span></div>
        <nav className="steps" aria-label="Шаги подготовки задачи">{['Описание', 'Уточнение', 'Карточка'].map((label, index) => <button key={label} disabled={busy || index > maxStep} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}{index < maxStep && <Check size={14} />}</button>)}</nav>
        <div className="builder"><section className="surface editor-surface"><fieldset disabled={busy || loading}>
          {step === 0 ? <>
            <div className="field"><label htmlFor="draft">Описание потребности</label><Textarea id="draft" rows={6} placeholder="Например: заявки приходят по почте и в мессенджерах. Менеджеры теряют обращения при передаче между отделами." value={draft.draft} maxLength={3000} onChange={e => editField('draft', e.target.value)} /><div className="field-meta"><span>Начните с процесса, проблемы и ожидаемого результата.</span><span>{draft.draft.length}/3000</span></div></div>
            <div className="field"><label>Направление</label><Picker label="Тема новой задачи" value={draft.topic} onChange={value => editField('topic', value)} items={topics.map(value => ({ value, label: value }))} disabled={busy} /></div>
            {!draft.id && <div className="examples"><span>Учебные примеры</span><div>{seedDrafts.map(example => <button key={example.topic} disabled={busy} onClick={() => guardEditor(() => { setDraft({ ...blankTask(), draft: example.text, topic: example.topic }); setDirty(true); setConfirmed(false); setQuestions([]); setAIResult(null); setMaxStep(0); })}>{example.topic}</button>)}</div></div>}
            <p className="ai-status">{aiNotice(ai, null)}</p>
            <div className="actions">{!draft.published && <Button variant="outline" disabled={busy || draft.draft.trim().length < 10} onClick={() => void save(false)}>Сохранить черновик</Button>}<Button disabled={busy || draft.draft.trim().length < 10 || !ai} onClick={() => void ask()}>{busy ? <Loader2 className="animate-spin" size={16} /> : null}Уточнить задачу<ArrowRight size={16} /></Button></div>
          </> : step === 1 ? <>
            <div className="ai-status" role="status">{aiResult ? aiNotice(ai, aiResult) : 'Сохранённые вопросы для проверки карточки. Повторный запрос к модели не выполнялся.'}</div>
            {questions.map((question, index) => <div className="field question-field" key={question.key}><label htmlFor={'q-' + question.key}><span className="question-number">{String(index + 1).padStart(2, '0')}</span>{question.text}</label><Textarea id={'q-' + question.key} value={draft[question.key]} maxLength={3000} placeholder="Ваш ответ" onChange={e => editField(question.key, e.target.value)} /></div>)}
            <div className="actions split"><Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft size={16} />Назад</Button><div>{!draft.published && <Button variant="outline" onClick={() => void save(false)}>Сохранить черновик</Button>}<Button onClick={() => { setDraft(value => ({ ...value, title: value.title || value.draft.slice(0, 80) })); setDirty(true); setStep(2); setMaxStep(2); setConfirmed(false); }}>Собрать карточку<ArrowRight size={16} /></Button></div></div>
          </> : <>
            <div className="two-cols"><div className="field"><label htmlFor="title">Название <span className="required">*</span></label><Input id="title" value={draft.title} maxLength={160} aria-invalid={draft.title.trim().length < 3} onChange={e => editField('title', e.target.value)} /><p className="help">Кратко: какой результат нужен бизнесу.</p></div><div className="field"><label htmlFor="org">Организация <span className="required">*</span></label><Input id="org" value={draft.org} maxLength={100} placeholder="Название организации" aria-invalid={draft.org.trim().length < 2} onChange={e => editField('org', e.target.value)} /></div></div>
            <div className="field"><label>Направление</label><Picker label="Тема карточки" value={draft.topic} onChange={value => editField('topic', value)} items={topics.map(value => ({ value, label: value }))} disabled={busy} /></div>
            {fieldDefs.map(field => <div className="field" key={field.key}><label htmlFor={field.key}>{field.label}<span className="field-weight">{field.points} баллов</span></label><Textarea id={field.key} value={draft[field.key]} maxLength={3000} placeholder={field.question} onChange={e => editField(field.key, e.target.value)} />{!isFilled(draft[field.key]) && <p className="help">Открытый вопрос — не учитывается в рейтинге.</p>}</div>)}
            <div className="confirmation"><label className="field-check"><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} /><span>Я проверил(а) заполненные сведения и подтверждаю их достоверность. Незаполненные поля останутся открытыми вопросами.</span></label></div>
            <p className="help">{draft.org.trim().length < 2 || draft.title.trim().length < 3 ? 'Для публикации укажите название и организацию.' : !confirmed ? 'Для публикации подтвердите сведения выше.' : 'Карточка готова к публикации.'}</p>
            <div className="actions"><Button variant="ghost" onClick={() => void ask()} disabled={busy || draft.draft.trim().length < 10}>Уточнить ещё</Button>{!draft.published && <Button variant="outline" onClick={() => void save(false)}>Сохранить черновик</Button>}<Button disabled={busy || !confirmed || draft.title.trim().length < 3 || draft.org.trim().length < 2} onClick={() => void save(true)}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}{draft.published ? 'Подтвердить изменения' : 'Опубликовать задачу'}</Button></div>
          </>}
        </fieldset></section><Rating task={draft} /></div>
      </>}
      {tab === 'offers' && <>
        <div className="page-heading"><div><div className="section-label">СОТРУДНИЧЕСТВО</div><h1 id="page-title" tabIndex={-1}>{business ? 'Отклики команд' : 'Мои отклики'}</h1><p>{business ? 'Сравните подходы и выберите исполнителей. Решение принимаете вы.' : 'Предложения, решения бизнеса и подтверждённые результаты.'}</p></div></div>
        {!business && <div className="team-summary"><span className="profile-badge">{activeTeam.initials}</span><div><h2>{activeTeam.name}</h2><p>{activeTeam.skills}</p><p className="help">Интересы: {activeTeam.interests}</p></div><div className="team-points"><strong>{proposals.filter(p => p.teamId === team && p.milestone).length * 20}</strong><span>баллов за результат</span></div></div>}
        <div className="status-filters" aria-label="Статус откликов">{proposalFilters.map(filter => <button key={filter.value} aria-pressed={proposalFilter === filter.value} onClick={() => setProposalFilter(filter.value)}>{filter.label}<span>{filter.value === 'all' ? ownProposals.length : ownProposals.filter(p => offerStatus(p) === filter.value).length}</span></button>)}</div>
        {business && shownProposals.length > 0 && <div className="comparison-toggle"><Button variant="outline" onClick={() => setCompare(value => !value)}>{compare ? 'Карточки предложений' : 'Сравнить в таблице'}</Button><span className="help">Выбор всегда остаётся за вами</span></div>}
        {business && compare && shownProposals.length > 0 ? <div className="comparison-table"><table><thead><tr><th>Команда / задача</th><th>Идея и план</th><th>Срок / прототип</th><th>Решение</th></tr></thead><tbody>{shownProposals.map(p => <tr key={p.id}><td><b>{teams.find(t => t.id === p.teamId)?.name}</b><p>{tasks.find(t => t.id === p.taskId)?.title}</p></td><td><b>{p.idea}</b><p>{p.plan}</p></td><td>{p.term}<br /><a href={p.link} target="_blank" rel="noopener noreferrer">Открыть прототип ↗</a></td><td><span className={'status '+p.status}>{p.milestone ? 'Этап подтверждён' : p.status === 'chosen' ? 'Выбрана' : p.status === 'rejected' ? 'Отклонена' : 'На рассмотрении'}</span>{!p.milestone && <div className="comparison-actions"><Button size="sm" disabled={busy || p.status === 'chosen'} onClick={() => void decide(p, 'chosen')}>Выбрать</Button><Button size="sm" variant="outline" disabled={busy || p.status === 'rejected'} onClick={() => void decide(p, 'rejected')}>Отклонить</Button></div>}</td></tr>)}</tbody></table></div> : shownProposals.length ? <div className="proposals-list">{shownProposals.map(renderProposal)}</div> : <div className="empty-state"><FileText size={26} /><h2>Нет откликов в этом разделе</h2><p>{proposalFilter !== 'all' ? 'Выберите другой статус или покажите все отклики.' : business ? 'После публикации задачи команды смогут предложить решение.' : 'Выберите задачу в каталоге и предложите свой подход.'}</p><Button variant="outline" onClick={() => proposalFilter !== 'all' ? setProposalFilter('all') : setTab('catalog')}>{proposalFilter !== 'all' ? 'Все отклики' : 'В каталог'}</Button></div>}
      </>}
      {tab === 'guide' && <section className="surface reading"><div className="section-label">СПРАВКА</div><h1 id="page-title" tabIndex={-1}>Как работать с платформой</h1><h2>Бизнес: от запроса до исполнителя</h2><ol><li>Создайте задачу и опишите проблему. Помощник задаст уточняющие вопросы.</li><li>Заполните карточку. Можно оставить неизвестные сведения открытыми.</li><li>Проверьте данные, подтвердите их и опубликуйте задачу.</li><li>Сравните отклики. Выберите одну, несколько команд или оставьте запрос без исполнителя.</li><li>Дождитесь отчёта команды и после фактической проверки подтвердите этап. Команда получит 20 баллов один раз.</li></ol><h2>Команда: от задачи до результата</h2><p>Откройте любую опубликованную задачу. Отправьте идею, план, срок и ссылку на прототип. Все предложения доступны бизнесу, автоматического назначения нет. Низкий рейтинг задачи не запрещает отклик.</p><h2>Что означает готовность</h2><p>Рейтинг оценивает полноту подтверждённого описания. Он не доказывает качество идеи или достоверность данных. Поле засчитывается при ответе от 8 символов; «не знаю» и другие простые заглушки не засчитываются.</p><div className="rating-table">{fieldDefs.map(field => <div key={field.key}><span>{field.label}</span><b>{field.points}</b></div>)}</div><h2>Учебная версия</h2><p>Для бизнеса и команд доступны отдельные аккаунты. Опубликованные задачи общие для всех участников. Черновики и управление доступны только бизнесу; команда видит только свои отклики. Организации, контакты и начальные примеры вымышленные. Ссылки example.com служат примерами и не ведут к рабочим прототипам.</p><p>Незавершённая карточка сохраняется в текущей вкладке и восстанавливается после обновления страницы. Для постоянного хранения нажмите «Сохранить черновик». Перед публикацией подтверждение всегда требуется заново.</p><h2>Помощник и данные</h2><p>{aiNotice(ai, null)} Помощник предлагает вопросы, а формулировки карточки и решение о выборе команды остаются за человеком. При сбое используются резервные вопросы с явным уведомлением.</p></section>}
      <footer className="footer-note"><span>AI Sana Challenge Hub <span className="footer-divider">/</span> МНВО</span><span>Учебная среда · {ai?.enabled && ai.keyConfigured ? 'OpenAI подключён' : 'Помощник в демо-режиме'}</span></footer>
    </main>
    <Sheet open={!!task} onOpenChange={open => { if (!open) closeTask(); }}><SheetContent className="task-sheet" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
      <SheetHeader className="task-sheet-header"><div className="section-label">{apply ? 'ОТКЛИК НА ЗАДАЧУ' : 'КАРТОЧКА ЗАДАЧИ'}</div><SheetTitle>{task?.title}</SheetTitle><SheetDescription>{task?.org || 'Организация не указана'} · {task?.topic}</SheetDescription></SheetHeader>
      {task && <div className="sheet-body">{errorNotice}
        {!apply ? <>
          <div className="detail-status"><span className={'readiness ' + (task.published ? level(task.score) : 'unpublished')}>{task.published ? readiness(task.score) : 'Черновик'} · {task.score}/100</span><span className="subtle">{task.published ? 'Опубликована' : 'Доступна только бизнесу'}</span></div>
          <div className="detail-action">{business ? <Button variant="outline" disabled={busy} onClick={() => editTask(task)}>Редактировать карточку</Button> : task.published && <Button disabled={busy} onClick={startOffer}>Предложить решение<ArrowRight size={16} /></Button>}</div>
          {fieldDefs.map(field => <div className="detail-block" key={field.key}><h3>{field.label}<span>{task.confirmed && isFilled(task[field.key]) ? field.points : 0}/{field.points}</span></h3><p className={!isFilled(task[field.key]) ? 'missing-field' : ''}>{task[field.key] || 'Нужно уточнить у бизнеса'}</p></div>)}
          {business ? <div className="task-proposals"><h2>Предложения команд</h2>{proposals.filter(p => p.taskId === task.id).length ? proposals.filter(p => p.taskId === task.id).map(renderProposal) : <p className="help">Пока нет предложений. Команды смогут откликнуться после публикации.</p>}</div> : task.published && <div className="detail-action bottom"><p className="help">Отклик открыт при любом рейтинге задачи.</p><Button disabled={busy} onClick={startOffer}>Предложить решение<ArrowRight size={16} /></Button></div>}
        </> : <form onSubmit={event => { event.preventDefault(); void submitOffer(); }}><fieldset disabled={busy || loading}><div className="offer-team"><span className="profile-badge">{activeTeam.initials}</span><div><b>{activeTeam.name}</b><p className="subtle">{activeTeam.skills}</p></div></div>
          {([{ key: 'idea', label: 'Идея решения', placeholder: 'Предлагаемый подход и его польза для бизнеса' }, { key: 'plan', label: 'План работы', placeholder: 'Основные этапы и что вы покажете на каждом' }] as const).map(field => <div className="field" key={field.key}><label htmlFor={'offer-' + field.key}>{field.label} *</label><Textarea id={'offer-' + field.key} required minLength={8} maxLength={3000} placeholder={field.placeholder} value={offer[field.key]} onChange={e => setOffer(value => ({ ...value, [field.key]: e.target.value }))} /></div>)}
          <p className="help mb-5">{cacheAvailable ? "Ввод сохраняется в этой вкладке до отправки." : "Хранилище вкладки недоступно. Не обновляйте страницу до отправки."}</p><div className="field"><label htmlFor="term">Срок *</label><Input id="term" required minLength={2} maxLength={100} value={offer.term} placeholder="Например, 2 недели" onChange={e => setOffer(value => ({ ...value, term: e.target.value }))} /></div>
          <div className="field"><label htmlFor="prototype">Ссылка на прототип *</label><Input type="url" id="prototype" required maxLength={500} value={offer.link} placeholder="https://…" onChange={e => setOffer(value => ({ ...value, link: e.target.value }))} /><p className="help">Ссылка на демонстрацию, макет или репозиторий.</p></div>
          <div className="actions"><Button type="button" variant="outline" onClick={closeTask}>Закрыть</Button><Button disabled={busy} type="submit">{busy ? 'Отправка…' : 'Отправить предложение'}<ArrowRight size={16} /></Button></div>
        </fieldset></form>}
      </div>}
    </SheetContent></Sheet>
    <Dialog open={!!milestone} onOpenChange={open => { if (!open && !busy) { setMilestone(null); setError(''); } }}><DialogContent><DialogHeader><DialogTitle>{business ? 'Подтвердить фактический результат' : 'Отправить результат этапа'}</DialogTitle><DialogDescription>{business ? 'Проверьте отчёт команды и опишите результат проверки. За подтверждённый этап начисляется 20 баллов один раз.' : 'Опишите выполненную работу, измеримый результат и добавьте ссылку на демонстрацию. Баллы появятся после проверки бизнесом.'}</DialogDescription></DialogHeader>{errorNotice}<label htmlFor="evidence" className="field-label">Результат и подтверждение</label><Textarea id="evidence" disabled={busy} value={evidence} maxLength={1500} placeholder="Что проверено и с каким результатом?" onChange={e => setEvidence(e.target.value)} /><Button disabled={busy || !isFilled(evidence)} onClick={() => void confirmMilestone()}>{busy ? 'Сохраняем…' : business ? 'Подтвердить и начислить баллы' : 'Отправить на проверку'}</Button></DialogContent></Dialog>
    <Dialog open={!!pendingAction} onOpenChange={open => { if (!open) setPendingAction(null); }}><DialogContent onOpenAutoFocus={event => { event.preventDefault(); document.getElementById("keep-editing")?.focus(); }}><DialogHeader><DialogTitle>Есть несохранённые изменения</DialogTitle><DialogDescription>{pendingAction?.message}</DialogDescription></DialogHeader><div className="actions"><Button variant="outline" onClick={() => { const action = pendingAction?.action; setPendingAction(null); action?.(); }}>Продолжить без сохранения</Button><Button id="keep-editing" onClick={() => setPendingAction(null)}>Остаться</Button></div></DialogContent></Dialog>
  </div>;
}
