'use client';
import { useApp } from './context';
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
  Plus,
  Menu,
  LogOut,
  Inbox as InboxIcon,
  Bell,
  CalendarCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
const navigation = [
  ['', 'Dashboard', LayoutDashboard],
  ['today', 'Today', Sun],
  ['tasks', 'Tasks', CheckSquare],
  ['inbox', 'Inbox', InboxIcon],
  ['assignments', 'Assignments', Files],
  ['calendar', 'Calendar', CalendarDays],
  ['timetable', 'Timetable', Clock],
  ['subjects', 'Subjects', BookOpen],
  ['exams', 'Exams', GraduationCap],
  ['study', 'Study', Headphones],
  ['grades', 'Grades', GraduationCap],
  ['analytics', 'Analytics', BarChart3],
  ['review', 'Weekly Review', CalendarCheck],
  ['notifications', 'Notifications', Bell],
  ['settings', 'Settings', SettingsIcon],
] as const;
export function AppSidebar({
  route,
  menu,
  collapsed,
  toggleSidebar,
  onSignOut,
}: {
  route: string;
  menu: boolean;
  collapsed: boolean;
  toggleSidebar: () => void;
  onSignOut: () => void;
}) {
  const { allData, data, go } = useApp();
  return (
    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <button className="brand" aria-label="Dashboard" onClick={() => go('/')}>
        <span>
          <BookOpen size={23} />
        </span>
        <span className="brand-name">Study.</span>
      </button>
      <button
        className="sidebar-toggle"
        onClick={toggleSidebar}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        <span>{collapsed ? 'Expand' : 'Collapse'}</span>
      </button>
      <div className="workspace-label">STUDENT WORKSPACE</div>
      <nav aria-label="Main navigation">
        {navigation.map(([url, label, Icon]) => (
          <a
            key={url}
            href={'/' + url}
            title={label}
            aria-label={label}
            onClick={(e) => {
              e.preventDefault();
              go('/' + url);
            }}
            className={
              (route === url ? 'active ' : '') +
              (['assignments', 'review', 'settings'].includes(url) ? 'nav-divider' : '')
            }
            aria-current={route === url ? 'page' : undefined}
          >
            <Icon size={19} />
            <span>{label}</span>
            {url === 'tasks' && (
              <small>{data.task.filter((t) => t.status !== 'Completed').length}</small>
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
        <button className="icon-button" aria-label="Sign out" onClick={onSignOut}>
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
export function BottomNavigation({
  route,
  menu,
  toggleMenu,
  toggleQuick,
}: {
  route: string;
  menu: boolean;
  toggleMenu: () => void;
  toggleQuick: () => void;
}) {
  const { go } = useApp();
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <button onClick={() => go('/today')} aria-current={route === 'today' ? 'page' : undefined}>
        <Sun size={20} />
        Today
      </button>
      <button onClick={() => go('/tasks')} aria-current={route === 'tasks' ? 'page' : undefined}>
        <CheckSquare size={20} />
        Tasks
      </button>
      <button aria-label="Quick Capture and Quick Add" onClick={() => toggleQuick()}>
        <Plus size={24} />
        Add
      </button>
      <button
        onClick={() => go('/calendar')}
        aria-current={route === 'calendar' ? 'page' : undefined}
      >
        <CalendarDays size={20} />
        Calendar
      </button>
      <button
        onClick={() => toggleMenu()}
        aria-expanded={menu}
        aria-current={!['today', 'tasks', 'calendar'].includes(route) ? 'page' : undefined}
      >
        <Menu size={20} />
        More
      </button>
    </nav>
  );
}
