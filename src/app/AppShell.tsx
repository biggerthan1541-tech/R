import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, Building2, CheckCircle2, ChevronsLeft, ChevronsRight, CircleUser,
  HelpCircle, Info, LogOut, Menu, Moon, Search, Sun, X, XCircle, Zap,
} from 'lucide-react';
import { MeridianMark, MeridianWordmark } from '@/components/Brand';
import { Avatar, IconButton, Popover, cx } from '@/components/ui';
import { NAV, QUICK_ACTIONS } from './nav';
import { useApp } from '@/lib/store';
import { ROLES, roleLabel } from '@/lib/permissions';
import { CommandPalette } from './CommandPalette';
import { NotificationPanel } from './NotificationPanel';

const STORAGE_COLLAPSED = 'meridian.nav.collapsed';

export const AppShell = () => {
  const { db, user, employee, can, logout, theme, setTheme, activeRole, setActiveRole, toasts, dismissToast } = useApp();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_COLLAPSED) === '1');
  const [mobileNav, setMobileNav] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { localStorage.setItem(STORAGE_COLLAPSED, collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMobileNav(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openTasks = useMemo(
    () => (user ? db.tasks.filter((t) => t.assigneeId === user.id && t.status === 'open') : []),
    [db.tasks, user],
  );
  const unread = useMemo(
    () => (user ? db.notifications.filter((n) => n.userId === user.id && !n.read) : []),
    [db.notifications, user],
  );
  const payrollAlerts = useMemo(
    () => (can('payroll.process') ? db.payrollIssues.filter((i) => !i.resolved && i.level === 'error').length : 0),
    [db.payrollIssues, can],
  );
  const approvals = useMemo(
    () => openTasks.filter((t) => ['pto', 'timecard', 'expense'].includes(t.kind)).length,
    [openTasks],
  );

  const groups = useMemo(
    () => NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.perms)) })).filter((g) => g.items.length),
    [can],
  );

  const badgeFor = (kind?: string) =>
    kind === 'approvals' ? approvals : kind === 'payroll' ? payrollAlerts : kind === 'tasks' ? openTasks.length : 0;

  if (!user || !employee) return null;

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3">
      {groups.map((group) => (
        <div key={group.id} className="mb-4 last:mb-1">
          {!collapsed ? (
            <p className="px-2.5 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-shell-muted/70">
              {group.label}
            </p>
          ) : <div className="mx-2 mb-2 border-t border-white/5" />}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const count = badgeFor(item.badge);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => cx(
                      'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-white/[0.09] text-shell-ink font-medium'
                        : 'text-shell-muted hover:bg-white/[0.05] hover:text-shell-ink',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand-400" /> : null}
                        <item.icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
                        {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                        {count > 0 ? (
                          <span className={cx(
                            'grid min-w-[1.15rem] place-items-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums',
                            item.badge === 'payroll' ? 'bg-danger-500 text-white' : 'bg-accent-500 text-brand-950',
                            collapsed && 'absolute right-1.5 top-1',
                          )}>
                            {count > 99 ? '99+' : count}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      {/* ---------------------------------------------------- desktop rail */}
      <aside
        className={cx(
          'sticky top-0 hidden h-screen shrink-0 flex-col bg-shell transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]',
        )}
      >
        <div className={cx('flex h-14 items-center border-b border-white/[0.07]', collapsed ? 'justify-center px-2' : 'px-4')}>
          {collapsed ? <MeridianMark size={30} /> : <MeridianWordmark size={30} />}
        </div>
        <NavList />
        <div className="border-t border-white/[0.07] p-2.5">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-shell-muted transition-colors hover:bg-white/[0.05] hover:text-shell-ink',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed ? 'Collapse' : null}
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------ mobile nav */}
      {mobileNav ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileNav(false)} />
          <div className="relative flex h-full w-[16.5rem] flex-col bg-shell animate-slide-left">
            <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-4">
              <MeridianWordmark size={28} />
              <IconButton label="Close navigation" icon={X} onClick={() => setMobileNav(false)} className="text-shell-muted hover:bg-white/10 hover:text-shell-ink" />
            </div>
            <NavList onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <IconButton label="Open navigation" icon={Menu} onClick={() => setMobileNav(true)} className="lg:hidden" />
            <div className="lg:hidden"><MeridianMark size={26} /></div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 min-w-[15rem] flex-1 max-w-md items-center gap-2 rounded-lg border border-line-strong bg-sunken px-2.5 text-left text-sm text-faint transition-colors hover:border-brand-300 hover:bg-surface sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 truncate">Search people, documents, actions…</span>
              <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[0.6rem] font-medium text-faint">⌘K</kbd>
            </button>

            <div className="flex-1 sm:hidden" />

            <IconButton label="Search" icon={Search} onClick={() => setPaletteOpen(true)} className="sm:hidden" />

            {/* org selector */}
            <Popover
              width="w-72"
              trigger={({ toggle }) => (
                <button
                  onClick={toggle}
                  className="hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-sunken md:flex"
                >
                  <Building2 className="h-3.5 w-3.5 text-brand-600" />
                  <span className="max-w-[9rem] truncate font-medium text-ink">{db.organization.dba}</span>
                </button>
              )}
            >
              <div className="p-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Organization</p>
                <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 p-2.5">
                  <p className="text-sm font-medium">{db.organization.legalName}</p>
                  <p className="mt-0.5 text-xs text-muted">EIN {db.organization.ein} · {db.locations.filter((l) => l.active).length} locations</p>
                </div>
                <p className="mt-3 text-xs text-muted">
                  You are signed in to the {db.organization.dba} tenant. Data isolation keeps every tenant's records separate.
                </p>
              </div>
            </Popover>

            {/* quick actions */}
            <Popover
              width="w-64"
              trigger={({ toggle }) => (
                <button
                  onClick={toggle}
                  className="hidden items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 sm:flex"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Quick actions
                </button>
              )}
            >
              {(close) => (
                <ul className="p-1.5">
                  {QUICK_ACTIONS.filter((a) => can(...a.perms)).map((a) => (
                    <li key={a.to + a.label}>
                      <button
                        onClick={() => { navigate(a.to); close(); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-sunken"
                      >
                        <a.icon className="h-4 w-4 text-brand-600" />
                        {a.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Popover>

            <IconButton
              label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              icon={theme === 'dark' ? Sun : Moon}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            />

            <Popover
              width="w-[22rem] sm:w-[26rem]"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unread.length ? (
                    <span className="absolute right-1.5 top-1.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-danger-500 px-1 text-[0.6rem] font-semibold text-white">
                      {unread.length > 9 ? '9+' : unread.length}
                    </span>
                  ) : null}
                </button>
              )}
            >
              {(close) => <NotificationPanel onClose={close} />}
            </Popover>

            <Popover
              width="w-72"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-sunken" aria-label="Account menu">
                  <Avatar first={employee.firstName} last={employee.lastName} seed={employee.avatarSeed} size={30} />
                  <span className="hidden text-left leading-tight xl:block">
                    <span className="block text-xs font-medium">{employee.preferredName} {employee.lastName}</span>
                    <span className="block text-[0.65rem] text-faint">{activeRole === 'all' ? 'All roles' : roleLabel(activeRole)}</span>
                  </span>
                </button>
              )}
            >
              {(close) => (
                <div>
                  <div className="flex items-center gap-3 border-b border-line p-3.5">
                    <Avatar first={employee.firstName} last={employee.lastName} seed={employee.avatarSeed} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{employee.firstName} {employee.lastName}</p>
                      <p className="truncate text-xs text-muted">{employee.email}</p>
                    </div>
                  </div>
                  <div className="border-b border-line p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Acting role</p>
                    <p className="mt-1 text-xs text-muted">Narrow your view to a single role to see exactly what that role can access.</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setActiveRole('all')}
                        className={cx('rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
                          activeRole === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-muted hover:bg-sunken')}
                      >
                        All roles
                      </button>
                      {user.roles.map((r) => (
                        <button
                          key={r}
                          onClick={() => setActiveRole(r)}
                          className={cx('rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
                            activeRole === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-muted hover:bg-sunken')}
                        >
                          {ROLES.find((x) => x.id === r)?.short ?? r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="p-1.5">
                    <li>
                      <Link to={`/people/${employee.id}`} onClick={close} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sunken">
                        <CircleUser className="h-4 w-4 text-muted" /> My profile
                      </Link>
                    </li>
                    <li>
                      <Link to="/help" onClick={close} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sunken">
                        <HelpCircle className="h-4 w-4 text-muted" /> Help &amp; support
                      </Link>
                    </li>
                    <li>
                      <button onClick={() => { close(); logout(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-danger-600 transition-colors hover:bg-danger-50">
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </Popover>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 pb-24 sm:px-5 sm:py-6 lg:pb-6">
          <Outlet />
        </main>

        <MobileTabBar />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* --------------------------------------------------------- toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : t.kind === 'warning' ? AlertTriangle : Info;
          const tone = t.kind === 'success' ? 'text-success-600' : t.kind === 'error' ? 'text-danger-500'
            : t.kind === 'warning' ? 'text-warning-500' : 'text-info-500';
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-raised p-3 shadow-pop animate-slide-up">
              <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', tone)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body ? <p className="mt-0.5 text-xs text-muted leading-relaxed">{t.body}</p> : null}
              </div>
              <button onClick={() => dismissToast(t.id)} className="text-faint hover:text-ink" aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------- mobile tab bar */

const MobileTabBar = () => {
  const { can, db, user } = useApp();
  const openTasks = user ? db.tasks.filter((t) => t.assigneeId === user.id && t.status === 'open').length : 0;
  const items = [
    ...NAV.flatMap((g) => g.items),
  ];
  const pick = (to: string) => items.find((i) => i.to === to && can(...i.perms));
  const tabs = [pick('/'), pick('/time'), pick('/scheduling'), pick('/time-off'), pick('/payroll')].filter(Boolean);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
      <ul className="flex items-stretch">
        {tabs.map((tab) => {
          const item = tab!;
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) => cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium transition-colors',
                  isActive ? 'text-brand-700' : 'text-faint',
                )}
              >
                <span className="relative">
                  <Icon className="h-[1.15rem] w-[1.15rem]" />
                  {item.to === '/' && openTasks > 0 ? (
                    <span className="absolute -right-1.5 -top-1 grid h-3.5 min-w-[0.875rem] place-items-center rounded-full bg-accent-500 px-0.5 text-[0.55rem] font-bold text-brand-950">
                      {openTasks > 9 ? '9+' : openTasks}
                    </span>
                  ) : null}
                </span>
                {item.short ?? item.label.split(' ')[0]}
              </NavLink>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
};

