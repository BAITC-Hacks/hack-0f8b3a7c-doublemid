"use client";
import { useState } from 'react';
import { ArrowRight, BriefcaseBusiness, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Login({ demo, onLogin }: { demo: boolean; onLogin: () => Promise<void> }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function login(user = email, secret = password) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email: user, password: secret }), signal: AbortSignal.timeout(15000) });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw Error(data.error || 'Не удалось войти.');
      await onLogin();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти. Проверьте соединение.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-story"><div className="login-brand"><span className="brand-symbol">S</span><b>AI Sana <span>Challenge Hub</span></b></div>
      <div className="login-story-content"><div className="eyebrow"><Sparkles size={15} /> ОТ ИДЕИ К РЕАЛЬНОМУ РЕЗУЛЬТАТУ</div><h1>Задачи бизнеса.<br />Энергия команд.<br /><em>Общий результат.</em></h1><p>Превратите потребность в понятный вызов. Найдите команду, которая готова его принять.</p>
        <div className="journey-preview"><div><span>01</span><b>Расскажите о задаче</b><small>Помощник уточнит детали</small></div><div><span>02</span><b>Повысьте готовность</b><small>До 100 баллов за полноту</small></div><div><span>03</span><b>Выберите команду</b><small>Решение остаётся за бизнесом</small></div></div>
      </div><p className="login-footnote">AI Sana · Практические задачи и студенческие решения</p>
    </section>
    <section className="login-panel"><div className="login-form"><span className="section-label">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>Добро пожаловать</h2><p className="login-subtitle">Войдите, чтобы перейти к задачам и командам.</p>
      <form onSubmit={e => { e.preventDefault(); void login(); }}><fieldset disabled={busy}><div className="field"><label htmlFor="login-email">Email</label><Input id="login-email" type="email" autoComplete="username" required value={email} placeholder="you@company.kz" onChange={e => setEmail(e.target.value)} /></div><div className="field"><label htmlFor="login-password">Пароль</label><Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>{error && <p role="alert" className="login-error">{error}</p>}<Button type="submit" className="login-submit">{busy ? 'Входим…' : 'Войти в кабинет'}<ArrowRight size={17} /></Button></fieldset></form>
      {demo && <div className="demo-accounts"><div className="demo-divider">ПОПРОБОВАТЬ ДЕМО</div><button disabled={busy} onClick={() => void login('admin@sana.demo', 'AdminSana2026!')}><BriefcaseBusiness size={22} /><span><b>Бизнес / администратор</b><small>Задачи, отклики и проверка результатов</small></span><ArrowRight size={17} /></button><button disabled={busy} onClick={() => void login('student@sana.demo', 'StudentSana2026!')}><GraduationCap size={23} /><span><b>Студенческая команда</b><small>Каталог, предложения и достижения</small></span><ArrowRight size={17} /></button><p>Учебные аккаунты используют общий каталог. Изменения видны всем участникам демонстрации.</p></div>}
      <div className="login-security"><ShieldCheck size={16} /> Отдельные кабинеты и права доступа</div>
    </div></section>
  </main>;
}
