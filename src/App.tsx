import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { Login } from '@/app/Login';
import { useApp } from '@/lib/store';
import { ErrorBoundary } from '@/app/ErrorBoundary';

import { DashboardPage } from '@/pages/Dashboard';
import { PeoplePage } from '@/pages/People';
import { EmployeeProfilePage } from '@/pages/EmployeeProfile';
import { RecruitingPage } from '@/pages/Recruiting';
import { OnboardingPage } from '@/pages/Onboarding';
import { HrPage } from '@/pages/Hr';
import { TimePage } from '@/pages/Time';
import { SchedulingPage } from '@/pages/Scheduling';
import { TimeOffPage } from '@/pages/TimeOff';
import { PayrollPage } from '@/pages/Payroll';
import { PayrollRunPage } from '@/pages/PayrollRun';
import { BenefitsPage } from '@/pages/Benefits';
import { ExpensesPage } from '@/pages/Expenses';
import { PerformancePage } from '@/pages/Performance';
import { LearningPage } from '@/pages/Learning';
import { DocumentsPage } from '@/pages/Documents';
import { SignaturesPage } from '@/pages/Signatures';
import { ReportsPage } from '@/pages/Reports';
import { AnalyticsPage } from '@/pages/Analytics';
import { SettingsPage } from '@/pages/Settings';
import { AuditPage } from '@/pages/Audit';
import { AssistantPage } from '@/pages/Assistant';
import { HelpPage } from '@/pages/Help';
import { NotFoundPage } from '@/pages/NotFound';

export const App = () => {
  const { user } = useApp();
  if (!user) return <Login />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
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
      </Routes>
    </ErrorBoundary>
  );
};
