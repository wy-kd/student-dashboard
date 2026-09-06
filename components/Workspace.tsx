'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Sun,
  CheckSquare,
  Files,
  CalendarDays,
  Clock,
  BookOpen,
  GraduationCap,
  Headphones,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Plus,
  Menu,
  X,
  LogOut,
  Moon,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { AppContext, type Editor as EditorType } from './context';
import { Editor } from './Editor';
import { Dashboard } from './Dashboard';
import { Tasks, Subjects, Assessments, Detail } from './Records';
import { Calendar, Study, Grades, Analytics } from './Planning';
import { Settings } from './Settings';
import { civilNow } from '@/lib/calculations';
import { fields, labels, type Data, type Entity, type RecordRow } from '@/lib/model';
const navigation = [
  ['', 'Dashboard', LayoutDashboard],
  ['today', 'Today', Sun],
  ['tasks', 'Tasks', CheckSquare],
  ['assignments', 'Assignments', Files],
  ['calendar', 'Calendar', CalendarDays],
  ['timetable', 'Timetable', Clock],
  ['subjects', 'Subjects', BookOpen],
  ['exams', 'Exams', GraduationCap],
  ['study', 'Study', Headphones],
  ['grades', 'Grades', GraduationCap],
  ['analytics', 'Analytics', BarChart3],
  ['settings', 'Settings', SettingsIcon],
] as const;
function scopeData(d: Data, id: string): Data {
  if (!id) return d;
  const subjects = d.subject.filter((s) => s.semesterId === id),
    ids = new Set(subjects.map((s) => s.id)),
    assignments = d.assignment.filter((a) => ids.has(a.subjectId)),
    exams = d.exam.filter((e) => ids.has(e.subjectId)),
    as = new Set(assignments.map((a) => a.id)),
    es = new Set(exams.map((e) => e.id));
  return {
    ...d,
    setting: { ...d.setting, activeSemesterId: id },
    semester: d.semester.filter((s) => s.id === id),
    subject: subjects,
    assignment: assignments,
    exam: exams,
    task: d.task.filter((t) => !t.subjectId || ids.has(t.subjectId)),
    milestone: d.milestone.filter((m) => as.has(m.assignmentId)),
    examTopic: d.examTopic.filter((t) => es.has(t.examId)),
    class: d.class.filter((c) => ids.has(c.subjectId)),
    studySession: d.studySession.filter((s) => !s.subjectId || ids.has(s.subjectId)),
    grade: d.grade.filter((g) => as.has(g.assignmentId) || es.has(g.examId)),
    importantDate: d.importantDate.filter((e) => !e.semesterId || e.semesterId === id),
    weeklyContent: d.weeklyContent.filter((w) => ids.has(w.subjectId)),
  };
}
export function Workspace() {
  const router = useRouter(),
    pathname = usePathname();
  const [auth, setAuth] = useState<{ setup: boolean; signedIn: boolean } | null>(null),
    [data, setData] = useState<Data | null>(null),
    [editor, setEditor] = useState<EditorType | null>(null),
    [toast, setToast] = useState(''),
    [problem, setProblem] = useState(''),
    [menu, setMenu] = useState(false),
    [quick, setQuick] = useState(false),
    [query, setQuery] = useState(''),
    [dark, setDark] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [tick, setTick] = useState(0),
    [password, setPassword] = useState(''),
    [setupToken, setSetupToken] = useState(''),
    [busy, setBusy] = useState(false);
  const [route, id] = pathname.split('/').slice(1);
  const notify = useCallback((s: string) => setToast(s), []);
  const reload = useCallback(async () => {
    const res = await fetch('/api/data', { cache: 'no-store' });
    const body = await res.json();
    if (res.status === 401) {
      setAuth({ setup: false, signedIn: false });
      setData(null);
      return;
    }
    if (!res.ok) throw Error(body.error);
    setData(body);
    setProblem('');
  }, []);
  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/auth', { cache: 'no-store' });
      if (!r.ok) throw Error('Unable to connect to the app.');
      const a = await r.json();
      setAuth(a);
      if (a.signedIn) await reload();
      setProblem('');
    } catch (e: any) {
      setProblem(e.message);
    }
  }, [reload]);
  useEffect(() => {
    check();
    const theme = localStorage.getItem('student-theme') === 'dark';
    setDark(theme);
    if ('serviceWorker' in navigator && window.isSecureContext)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [check]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('student-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    if (!auth?.signedIn) return;
    const refresh = () => {
      setTick((t) => t + 1);
      if (document.visibilityState === 'visible')
        reload().catch(() =>
          setProblem(
            'Cannot reach the laptop. Your last loaded data is shown. Reconnect before making changes.',
          ),
        );
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [auth?.signedIn, reload]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  async function mutate(entity: Entity, values: Record<string, any>, old?: RecordRow) {
    const input = Object.fromEntries(
      fields[entity].map((f) => [f.key, values[f.key] ?? (f.type === 'checkbox' ? false : '')]),
    );
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, data: input, id: old?.id, revision: old?.revision }),
    });
    const b = await res.json();
    if (!res.ok) throw Error(b.error);
    await reload();
    notify('Saved.');
  }
  async function remove(entity: Entity, row: RecordRow) {
    const res = await fetch('/api/data', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id: row.id, revision: row.revision }),
    });
    const b = await res.json();
    if (!res.ok) throw Error(b.error);
    await reload();
    notify('Deleted.');
  }
  const go = (url: string) => {
    router.push(url);
    setMenu(false);
    setQuery('');
    setQuick(false);
  };
  const open = (e: EditorType) => {
    setEditor(e);
    setQuick(false);
  };
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, setupToken }),
      });
      const b = await res.json();
      if (!res.ok) throw Error(b.error);
      setPassword('');
      setSetupToken('');
      await check();
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!auth || (auth.signedIn && !data))
    return (
      <main className="loading-screen">
        <BookOpen size={38} />
        <h1>Student Dashboard</h1>
        <p>{problem || 'Opening your workspace…'}</p>
        {problem && (
          <button className="button primary" onClick={check}>
            Retry connection
          </button>
        )}
      </main>
    );
  if (!auth.signedIn)
    return (
      <main className="login-screen">
        <div className="login-story">
          <div className="brand">
            <span>
              <BookOpen size={23} />
            </span>
            Study<span className="brand-dot">.</span>
          </div>
          <h1>
            A little clarity.
            <br />A lot of progress.
          </h1>
          <p>
            Your subjects, deadlines and next steps.
            <br />
            One workspace, on your own computer.
          </p>
          <div className="login-foot">Built for the semester ahead.</div>
        </div>
        <form className="login-form" onSubmit={signIn}>
          <p className="eyebrow">YOUR PERSONAL STUDY SPACE</p>
          <h2>{auth.setup ? 'Make yourself at home.' : 'Welcome back.'}</h2>
          <p>
            {auth.setup
              ? 'Set a password for access from your laptop, phone and iPad.'
              : 'Sign in to see what needs your attention.'}
          </p>
          {auth.setup && (
            <label className="field">
              First-time setup token
              <input
                required
                value={setupToken}
                autoComplete="off"
                onChange={(e) => setSetupToken(e.target.value)}
              />
              <small>
                Copy the token printed in your laptop terminal when you run npm run dev.
              </small>
            </label>
          )}
          <label className="field">
            {auth.setup ? 'Create a password' : 'Password'}
            <input
              type="password"
              required
              minLength={10}
              maxLength={200}
              autoComplete={auth.setup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>At least 10 characters</small>
          </label>
          {problem && (
            <p role="alert" className="error">
              {problem}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Opening…' : auth.setup ? 'Create my workspace' : 'Open my workspace'}
            <ArrowRight size={18} />
          </button>
          <p className="muted">Your records stay in the database on your laptop.</p>
        </form>
      </main>
    );
  const allData = data!,
    semesterId = selected ?? data!.setting.activeSemesterId ?? '',
    scoped = scopeData(allData, semesterId),
    now = civilNow(allData.setting.timezone);
  const context = { data: scoped, allData, now, open, save: mutate, remove, reload, notify, go };
  const searchResults = query.trim()
    ? (['subject', 'assignment', 'exam', 'task'] as Entity[])
        .flatMap((e) =>
          allData[e]
            .filter((r) =>
              [r.name, r.code, r.notes, r.description].some((v) =>
                String(v ?? '')
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ),
            )
            .map((r) => ({ entity: e, row: r })),
        )
        .slice(0, 20)
    : [];
  let page: React.ReactNode;
  switch (route) {
    case '':
      page = <Dashboard />;
      break;
    case 'today':
      page = <Dashboard todayOnly />;
      break;
    case 'tasks':
      page = <Tasks />;
      break;
    case 'assignments':
      page = id ? <Detail entity="assignment" id={id} /> : <Assessments />;
      break;
    case 'exams':
      page = id ? <Detail entity="exam" id={id} /> : <Assessments exam />;
      break;
    case 'subjects':
      page = id ? <Detail entity="subject" id={id} /> : <Subjects />;
      break;
    case 'calendar':
      page = <Calendar />;
      break;
    case 'timetable':
      page = <Calendar timetable />;
      break;
    case 'study':
      page = <Study />;
      break;
    case 'grades':
      page = <Grades />;
      break;
    case 'analytics':
      page = <Analytics />;
      break;
    case 'settings':
      page = <Settings key={allData.setting.activeSemesterId} />;
      break;
    default:
      page = (
        <div className="empty">
          <h1>Page not found</h1>
          <button className="button primary" onClick={() => go('/')}>
            Go to dashboard
          </button>
        </div>
      );
  }
  return (
    <AppContext.Provider value={context}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        {menu && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={'sidebar ' + (menu ? 'open' : '')}>
          <button className="brand" onClick={() => go('/')}>
            <span>
              <BookOpen size={23} />
            </span>
            Study<span className="brand-dot">.</span>
          </button>
          <div className="workspace-label">STUDENT WORKSPACE</div>
          <nav aria-label="Main navigation">
            {navigation.map(([url, label, Icon]) => (
              <a
                key={url}
                href={'/' + url}
                onClick={(e) => {
                  e.preventDefault();
                  go('/' + url);
                }}
                className={route === url ? 'active' : ''}
                aria-current={route === url ? 'page' : undefined}
              >
                <Icon size={19} />
                <span>{label}</span>
                {url === 'tasks' && (
                  <small>{scoped.task.filter((t) => t.status !== 'Completed').length}</small>
                )}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="avatar">{allData.setting.name.slice(0, 1).toUpperCase()}</div>
            <div className="grow">
              <strong>{allData.setting.name}</strong>
              <small>Personal workspace</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  const r = await fetch('/api/auth', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                  });
                  if (!r.ok) throw Error('Could not sign out. Please try again.');
                  setData(null);
                  await check();
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label="Search all subjects, assessments, tasks and notes"
                placeholder="Search your workspace…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQuery('');
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  <X size={16} />
                </button>
              )}
              {query && (
                <div className="search-results">
                  <p>All semesters</p>
                  {searchResults.length ? (
                    searchResults.map(({ entity, row }) => (
                      <button
                        key={row.id}
                        onClick={() => {
                          setQuery('');
                          if (entity === 'task') open({ entity, row });
                          else
                            go(
                              `/${entity === 'subject' ? 'subjects' : entity === 'exam' ? 'exams' : 'assignments'}/${row.id}`,
                            );
                        }}
                      >
                        <span>{labels[entity]}</span>
                        <strong>
                          {row.code ? row.code + ' · ' : ''}
                          {row.name}
                        </strong>
                      </button>
                    ))
                  ) : (
                    <p>No matching records</p>
                  )}
                </div>
              )}
            </div>
            <select
              className="semester-picker"
              aria-label="View semester"
              value={semesterId}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">All semesters</option>
              {allData.semester.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <div className="quick-add">
              <button
                className="button primary"
                aria-expanded={quick}
                onClick={() => setQuick(!quick)}
              >
                <Plus size={18} />
                <span>Quick add</span>
              </button>
              {quick && (
                <>
                  <button
                    className="menu-dismiss"
                    aria-label="Close quick add menu"
                    onClick={() => setQuick(false)}
                  />
                  <div className="quick-menu">
                    {(
                      [
                        'task',
                        'assignment',
                        'exam',
                        'class',
                        'studySession',
                        'importantDate',
                        'subject',
                        'semester',
                      ] as Entity[]
                    ).map((e) => (
                      <button key={e} onClick={() => open({ entity: e })}>
                        <Plus size={16} />
                        {labels[e]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </header>
          <main id="main" key={pathname} tabIndex={-1}>
            {problem && (
              <div role="alert" className="error inline">
                {problem}
                <button
                  className="text-button"
                  onClick={() => reload().catch((e) => notify(e.message))}
                >
                  <RefreshCw size={16} />
                  Retry
                </button>
              </div>
            )}
            <div className="mobile-semester">
              <label>
                View semester
                <select
                  aria-label="View semester on mobile"
                  value={semesterId}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">All semesters</option>
                  {allData.semester.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {page}
            <footer className="workspace-footer">
              Your workspace · {allData.setting.timezone} · Synced with this laptop every 15 seconds
            </footer>
          </main>
        </div>
      </div>
      {editor && (
        <Editor
          key={editor.entity + (editor.row?.id ?? 'new')}
          editor={editor}
          close={() => setEditor(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
