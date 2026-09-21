import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { Login } from '@/app/Login';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { PageSkeleton } from '@/app/PageSkeleton';
import { useApp } from '@/lib/store';

/* Modules load on demand so the first paint stays small. */
const DashboardPage = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const PeoplePage = lazy(() => import('@/pages/People').then((m) => ({ default: m.PeoplePage })));
const EmployeeProfilePage = lazy(() => import('@/pages/EmployeeProfile').then((m) => ({ default: m.EmployeeProfilePage })));
const RecruitingPage = lazy(() => import('@/pages/Recruiting').then((m) => ({ default: m.RecruitingPage })));
const OnboardingPage = lazy(() => import('@/pages/Onboarding').then((m) => ({ default: m.OnboardingPage })));
const HrPage = lazy(() => import('@/pages/Hr').then((m) => ({ default: m.HrPage })));
const TimePage = lazy(() => import('@/pages/Time').then((m) => ({ default: m.TimePage })));
const SchedulingPage = lazy(() => import('@/pages/Scheduling').then((m) => ({ default: m.SchedulingPage })));
const TimeOffPage = lazy(() => import('@/pages/TimeOff').then((m) => ({ default: m.TimeOffPage })));
const PayrollPage = lazy(() => import('@/pages/Payroll').then((m) => ({ default: m.PayrollPage })));
const PayrollRunPage = lazy(() => import('@/pages/PayrollRun').then((m) => ({ default: m.PayrollRunPage })));
const BenefitsPage = lazy(() => import('@/pages/Benefits').then((m) => ({ default: m.BenefitsPage })));
const ExpensesPage = lazy(() => import('@/pages/Expenses').then((m) => ({ default: m.ExpensesPage })));
const PerformancePage = lazy(() => import('@/pages/Performance').then((m) => ({ default: m.PerformancePage })));
const LearningPage = lazy(() => import('@/pages/Learning').then((m) => ({ default: m.LearningPage })));
const DocumentsPage = lazy(() => import('@/pages/Documents').then((m) => ({ default: m.DocumentsPage })));
const SignaturesPage = lazy(() => import('@/pages/Signatures').then((m) => ({ default: m.SignaturesPage })));
const ReportsPage = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.ReportsPage })));
const AnalyticsPage = lazy(() => import('@/pages/Analytics').then((m) => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })));
const AuditPage = lazy(() => import('@/pages/Audit').then((m) => ({ default: m.AuditPage })));
const AssistantPage = lazy(() => import('@/pages/Assistant').then((m) => ({ default: m.AssistantPage })));
const HelpPage = lazy(() => import('@/pages/Help').then((m) => ({ default: m.HelpPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })));

export const App = () => {
  const { user } = useApp();
  if (!user) return <Login />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            element={
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/:employeeId" element={<EmployeeProfilePage />} />
            <Route path="recruiting" element={<RecruitingPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="hr" element={<HrPage />} />
            <Route path="time" element={<TimePage />} />
            <Route path="time/timecards/:timecardId" element={<TimePage />} />
            <Route path="scheduling" element={<SchedulingPage />} />
            <Route path="time-off" element={<TimeOffPage />} />
            <Route path="time-off/requests/:requestId" element={<TimeOffPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="payroll/my-pay" element={<PayrollPage />} />
            <Route path="payroll/runs/:runId" element={<PayrollRunPage />} />
            <Route path="benefits" element={<BenefitsPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="expenses/:reportId" element={<ExpensesPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="learning" element={<LearningPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/sign/:requestId" element={<SignaturesPage />} />
            <Route path="signatures" element={<SignaturesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
};

