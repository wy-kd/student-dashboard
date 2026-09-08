// Disposable UI fixture. This is bundled only by scripts/visual-fixture.mjs, never an app route.
// No authentication code or private database is used, and no production API is mocked.
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext } from '../components/context';
import { Dashboard } from '../components/Dashboard';
import { Tasks, Subjects, Assessments, Detail } from '../components/Records';
import { Calendar, Study, Grades, Analytics } from '../components/Planning';
import { Settings } from '../components/Settings';
import { FocusMode, MiniTimer } from '../components/StudyTimer';
import { Inbox } from '../components/Inbox';
import { NotificationCentre } from '../components/Notifications';
import { WeeklyReview } from '../components/DailyPlanning';
import { Editor } from '../components/Editor';
import { defaultLayout } from '../lib/dashboard-layout';
import { AppSidebar, BottomNavigation } from '../components/AppNavigation';
import { checkSidebar } from './sidebar-browser';
import { useSidebarPreference } from '../components/useSidebarPreference';
import { defaults, entities, type Data } from '../lib/model';
const date = '2026-09-07T09:00';
const row = (entity: any, id: string, extra: any) => ({
  ...defaults(entity),
  id,
  revision: 0,
  ...extra,
});
const d = {
  ...Object.fromEntries(entities.map((e) => [e, []])),
  setting: {
    name: 'Student',
    timezone: 'Australia/Brisbane',
    dailyHours: 3,
    activeSemesterId: 'semester',
  },
} as Data;
d.semester = [
  row('semester', 'semester', {
    name: 'Semester 2',
    startDate: '2026-07-20',
    endDate: '2026-11-20',
    teachingStart: '2026-07-20',
    teachingWeeks: 13,
  }),
];
d.subject = [
  row('subject', 'security', {
    code: 'IFB240',
    name: 'Information Security',
    semesterId: 'semester',
  }),
  row('subject', 'programming', {
    code: 'CAB202',
    name: 'Programming',
    semesterId: 'semester',
    color: '#267871',
  }),
];
d.assignment = [
  row('assignment', 'report', {
    name: 'Security Report',
    subjectId: 'security',
    dueAt: '2026-09-10T17:00',
    weighting: 35,
    progress: 45,
    estimatedHours: 10,
  }),
  row('assignment', 'project', {
    name: 'Programming Project',
    subjectId: 'programming',
    dueAt: '2026-09-17T17:00',
    weighting: 40,
    estimatedHours: 12,
  }),
];
d.task = [
  row('task', 'risk', {
    name: 'Complete risk analysis section',
    assignmentId: 'report',
    subjectId: 'security',
    dueAt: '2026-09-07T17:00',
    estimatedHours: 2,
  }),
  row('task', 'tutorial', {
    name: 'Review tutorial questions',
    subjectId: 'programming',
    dueAt: '2026-09-06T17:00',
  }),
];
d.exam = [
  row('exam', 'exam', {
    name: 'Final revision',
    subjectId: 'programming',
    dueAt: '2026-09-18T09:00',
    weighting: 60,
    estimatedHours: 15,
  }),
];
d.class = [
  row('class', 'class', {
    name: 'Security tutorial',
    subjectId: 'security',
    day: 1,
    startTime: '10:00',
    endTime: '11:00',
    startDate: '2026-07-20',
    endDate: '2026-11-20',
  }),
];
d.studySession = [
  row('studySession', 'session', {
    name: 'Report research',
    subjectId: 'security',
    assignmentId: 'report',
    dueAt: '2026-09-07T15:00',
    plannedHours: 50 / 60,
  }),
];
d.productivity = {
  preference: {
    userId: 'owner',
    revision: 0,
    layout: JSON.stringify(defaultLayout()),
    density: 'Comfortable',
    assignmentReminders: true,
    examReminders: true,
    taskReminders: true,
    studyReminders: true,
    workloadWarnings: false,
    dailySummary: false,
    summaryTime: '08:00',
    quietStart: '23:00',
    quietEnd: '08:00',
    privatePush: true,
  },
  rules: [],
  timer: null,
  inbox: [{ id: 'capture', name: 'Prepare questions for the tutorial' }],
  recurrences: [
    {
      id: 'series',
      revision: 0,
      name: 'Weekly tutorial review',
      weekdays: '',
      weekInterval: 1,
      intervalDays: 7,
      enabled: true,
      anchor: '2026-09-07',
      nextDate: '2026-09-14',
      time: '17:00',
      subjectId: 'security',
      assignmentId: null,
      estimatedHours: 1,
      priority: 'Medium',
      endDate: null,
      occurrences: [],
    },
  ],
  notifications: [
    {
      id: 'notice',
      title: 'Security Report',
      message: 'Due 10 September · 17:00',
      category: 'Deadline',
      createdAt: Date.now(),
      readAt: null,
    },
  ],
  todos: [
    {
      id: 'todo-email',
      name: 'Email tutor about the report',
      completed: false,
      dueDate: '2026-09-09',
      position: 0,
      revision: 0,
    },
    {
      id: 'todo-print',
      name: 'Print worksheet',
      completed: false,
      dueDate: null,
      position: 1,
      revision: 0,
    },
    {
      id: 'todo-calculator',
      name: 'Bring calculator',
      completed: true,
      dueDate: null,
      position: 2,
      revision: 0,
    },
  ],
  subscriptions: [],
  serverNow: Date.now(),
  pushPublicKey: null,
};
function Harness() {
  const { collapsed, toggleSidebar } = useSidebarPreference();
  const [menu, setMenu] = useState(false),
    [density, setDensity] = useState('Comfortable');

  const [route, go] = useState('Dashboard'),
    [editor, open] = useState<any>(null),
    [empty, setEmpty] = useState(false),
    [dark, setDark] = useState(false),
    [timer, setTimer] = useState(false),
    [timerMode, setTimerMode] = useState('countdown'),
    [timerStatus, setTimerStatus] = useState('running'),
    [toast, notify] = useState('');
  const data: Data = empty ? { ...d, ...Object.fromEntries(entities.map((e) => [e, []])) } : d;
  data.productivity = {
    ...d.productivity,
    recurrences: empty ? [] : d.productivity.recurrences,
    todos: empty ? [] : d.productivity.todos,
    serverNow: Date.now(),
    timer: timer
      ? {
          id: 'timer',
          userId: 'owner',
          activeKey: 'owner',
          revision: 0,
          name: 'Focused study',
          mode: timerMode,
          status: timerStatus,
          phase: 'focus',
          startedAt: Date.now() - 12 * 60000,
          segmentAt: Date.now() - 12 * 60000,
          elapsedMs: 0,
          focusMs: 0,
          focusMinutes: 50,
          breakMinutes: 10,
          rounds: 2,
          round: 1,
          subjectId: 'security',
          assignmentId: 'report',
          taskId: 'risk',
          examId: null,
          sessionId: null,
        }
      : null,
  };
  const pages: any = {
    Dashboard: <Dashboard />,
    Today: <Dashboard todayOnly />,
    Tasks: <Tasks />,
    Assignments: <Assessments />,
    Subjects: <Subjects />,
    Exams: <Assessments exam />,
    Study: <Study />,
    Calendar: <Calendar />,
    Timetable: <Calendar timetable />,
    Grades: <Grades />,
    Analytics: <Analytics />,
    Settings: <Settings />,
    Inbox: <Inbox />,
    Notifications: <NotificationCentre />,
    Review: <WeeklyReview />,
    Focus: <FocusMode />,
    Detail: <Detail entity="assignment" id="report" />,
  };
  const nav = (url: string) =>
    go(
      url === '/focus'
        ? 'Focus'
        : url === '/study'
          ? 'Study'
          : url === '/today'
            ? 'Today'
            : url === '/calendar'
              ? 'Calendar'
              : url === '/notifications'
                ? 'Notifications'
                : url.startsWith('/tasks')
                  ? 'Tasks'
                  : url === '/review'
                    ? 'Review'
                    : 'Detail',
    );
  return (
    <AppContext.Provider
      value={{
        data,
        allData: data,
        now: date,
        open,
        go: nav,
        notify,
        save: async () => notify('Read-only fixture: persistence is tested separately.'),
        remove: async () => {},
        reload: async () => {},
      }}
    >
      <div
        data-theme={dark ? 'dark' : 'light'}
        style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' }}
      >
        <nav className="fixture-nav">
          <label>
            Density
            <select value={density} onChange={(e) => setDensity(e.target.value)}>
              <option>Comfortable</option>
              <option>Compact</option>
            </select>
          </label>
          <label>
            Screen
            <select value={route} onChange={(e) => go(e.target.value)}>
              {Object.keys(pages).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} />
            Empty
          </label>
          <label>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
            Dark
          </label>
          <label>
            <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} />
            Active timer
          </label>
          <label>
            Timer mode
            <select value={timerMode} onChange={(e) => setTimerMode(e.target.value)}>
              <option>countdown</option>
              <option>stopwatch</option>
            </select>
          </label>
          <label>
            Timer state
            <select value={timerStatus} onChange={(e) => setTimerStatus(e.target.value)}>
              <option>running</option>
              <option>paused</option>
              <option>review</option>
            </select>
          </label>
          <button
            onClick={() => {
              void checkSidebar()
                .then(notify)
                .catch((e) => notify(e.message));
            }}
          >
            Run navigation checks
          </button>
          <button onClick={() => open({ entity: 'assignment' })}>New assignment</button>
        </nav>
        <div
          className={
            'app-shell ' +
            (collapsed ? 'sidebar-collapsed ' : '') +
            (route === 'Focus' ? 'focus-shell' : '') +
            (timer && route !== 'Focus' ? ' has-floating-timer' : '')
          }
          data-density={density}
        >
          {menu && (
            <button
              className="sidebar-scrim"
              aria-label="Close navigation"
              onClick={() => setMenu(false)}
            />
          )}
          <AppSidebar
            route={route.toLowerCase()}
            menu={menu}
            collapsed={collapsed}
            toggleSidebar={toggleSidebar}
            onSignOut={() => notify('Fixture only')}
          />
          <div className="main-shell">
            <header className="topbar">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMenu(!menu)}
              >
                Menu
              </button>
            </header>
            <main id="main" tabIndex={-1}>
              {pages[route]}
            </main>
            {timer && route !== 'Focus' && (
              <div className="timer-float">
                <MiniTimer />
              </div>
            )}
          </div>
        </div>
        {route !== 'Focus' && (
          <BottomNavigation
            route={route.toLowerCase()}
            menu={menu}
            toggleMenu={() => setMenu(!menu)}
            toggleQuick={() => notify('Quick capture fixture')}
          />
        )}
        {editor && <Editor editor={editor} close={() => open(null)} />}
        <p role="status">{toast}</p>
      </div>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById('fixture')!).render(<Harness />);
