import type React from 'react';
import {
  BadgeDollarSign, BarChart3, Bot, Briefcase, CalendarDays, ClipboardList, Clock,
  FileSignature, FileText, GraduationCap, HeartPulse, LayoutDashboard, Plane,
  Receipt, Settings, Target, UserPlus, Users, Wallet,
} from 'lucide-react';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Any one of these permissions grants visibility. */
  perms: Permission[];
  badge?: 'tasks' | 'approvals' | 'payroll';
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    id: 'home',
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, perms: ['people.view.self'] },
      { to: '/assistant', label: 'Meridian Assistant', icon: Bot, perms: ['people.view.self'] },
    ],
  },
  {
    id: 'workforce',
    label: 'Workforce',
    items: [
      { to: '/people', label: 'People', icon: Users, perms: ['people.view.self', 'people.view.team', 'people.view.all'] },
      { to: '/recruiting', label: 'Recruiting', icon: Briefcase, perms: ['recruiting.view'] },
      { to: '/onboarding', label: 'Onboarding', icon: UserPlus, perms: ['onboarding.view.self', 'onboarding.view.team', 'onboarding.manage'] },
      { to: '/hr', label: 'HR Operations', icon: ClipboardList, perms: ['people.lifecycle.manage', 'people.view.all'] },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    items: [
      { to: '/time', label: 'Time & Attendance', icon: Clock, perms: ['time.view.self', 'time.view.team', 'time.view.all'], badge: 'approvals' },
      { to: '/scheduling', label: 'Scheduling', icon: CalendarDays, perms: ['schedule.view.self', 'schedule.view.team', 'schedule.view.all'] },
      { to: '/time-off', label: 'Time Off', icon: Plane, perms: ['pto.request', 'pto.view.team', 'pto.view.all'] },
    ],
  },
  {
    id: 'pay',
    label: 'Pay & Benefits',
    items: [
      { to: '/payroll', label: 'Payroll', icon: Wallet, perms: ['payroll.view.self', 'payroll.view.all', 'payroll.process'], badge: 'payroll' },
      { to: '/benefits', label: 'Benefits', icon: HeartPulse, perms: ['benefits.view.self', 'benefits.view.all', 'benefits.manage'] },
      { to: '/expenses', label: 'Expenses', icon: Receipt, perms: ['expense.submit', 'expense.view.all', 'expense.approve.team'] },
    ],
  },
  {
    id: 'talent',
    label: 'Talent',
    items: [
      { to: '/performance', label: 'Performance', icon: Target, perms: ['performance.view.self', 'performance.view.team', 'performance.view.all'] },
      { to: '/learning', label: 'Learning', icon: GraduationCap, perms: ['learning.view.self', 'learning.assign', 'learning.manage'] },
    ],
  },
  {
    id: 'records',
    label: 'Records',
    items: [
      { to: '/documents', label: 'Documents', icon: FileText, perms: ['documents.view.self', 'documents.view.all'] },
      { to: '/signatures', label: 'Signatures', icon: FileSignature, perms: ['documents.view.self', 'documents.manage'] },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { to: '/reports', label: 'Reports', icon: FileText, perms: ['reports.view', 'reports.view.all'] },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, perms: ['analytics.view'] },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, perms: ['settings.view', 'settings.manage', 'security.manage'] },
      { to: '/audit', label: 'Audit Log', icon: BadgeDollarSign, perms: ['audit.view'] },
    ],
  },
];

export const QUICK_ACTIONS: { label: string; to: string; perms: Permission[]; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: 'Request time off', to: '/time-off?compose=1', perms: ['pto.request'], icon: Plane },
  { label: 'Submit an expense', to: '/expenses?compose=1', perms: ['expense.submit'], icon: Receipt },
  { label: 'View my pay', to: '/payroll', perms: ['payroll.view.self'], icon: Wallet },
  { label: 'View my schedule', to: '/scheduling', perms: ['schedule.view.self'], icon: CalendarDays },
  { label: 'Approve timecards', to: '/time?tab=approvals', perms: ['time.approve'], icon: Clock },
  { label: 'Run payroll', to: '/payroll?tab=runs', perms: ['payroll.process'], icon: Wallet },
  { label: 'Add an employee', to: '/hr?action=hire', perms: ['people.lifecycle.manage'], icon: UserPlus },
  { label: 'Open a requisition', to: '/recruiting?compose=1', perms: ['recruiting.manage'], icon: Briefcase },
];
