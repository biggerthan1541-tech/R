import { useMemo, useState } from 'react';
import { ArrowRight, KeyRound, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { MeridianWordmark } from '@/components/Brand';
import { Avatar, Button, Field, Input, SearchInput, cx } from '@/components/ui';
import { useApp } from '@/lib/store';
import { ROLES } from '@/lib/permissions';
import type { Role } from '@/lib/types';

export const Login = () => {
  const { db, login } = useApp();
  const [step, setStep] = useState<'persona' | 'password' | 'mfa'>('persona');
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  /** One representative account per role, plus a plain employee. */
  const personas = useMemo(() => {
    const out: { role: Role; userId: string }[] = [];
    const taken = new Set<string>();
    for (const r of ROLES) {
      if (r.id === 'employee') continue;
      const match = db.users.find((u) => u.roles.includes(r.id) && u.status === 'active' && !taken.has(u.id));
      if (match) { taken.add(match.id); out.push({ role: r.id, userId: match.id }); }
    }
    const plain = db.users.find((u) => u.roles.length === 1 && u.roles[0] === 'employee' && u.status === 'active');
    if (plain) out.unshift({ role: 'employee', userId: plain.id });
    return out;
  }, [db.users]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return db.users
      .filter((u) => u.status === 'active')
      .filter((u) => `${u.displayName} ${u.email}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [db.users, query]);

  const selectedUser = selected ? db.users.find((u) => u.id === selected) : null;
  const selectedEmployee = selectedUser?.employeeId
    ? db.employees.find((e) => e.id === selectedUser.employeeId)
    : null;

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) {
      setError('Enter at least 4 characters. This demo accepts any password.');
      return;
    }
    setError('');
    setStep(selectedUser?.mfaEnabled ? 'mfa' : 'persona');
    if (!selectedUser?.mfaEnabled && selected) login(selected);
  };

  const submitMfa = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit code. Any six digits work in this demo.');
      return;
    }
    if (selected) login(selected);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------------------------------ brand side */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-shell p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(60rem 40rem at 12% 8%, rgba(140,121,238,0.30), transparent 62%),' +
              'radial-gradient(40rem 30rem at 88% 92%, rgba(14,124,134,0.28), transparent 60%)',
          }}
        />
        <div className="relative">
          <MeridianWordmark size={34} />
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-[2.1rem] font-semibold leading-tight tracking-[-0.02em] text-shell-ink">
            One system of record for every hour, every dollar, every person.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-shell-muted">
            Meridian connects recruiting, onboarding, scheduling, time, benefits, performance and payroll
            on a single employee record — so a punch on the warehouse floor and a paycheck on Friday are
            the same piece of data, not two systems arguing.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-5">
            {[
              ['Modules', '18'],
              ['Roles', '9'],
              ['Data model', 'Unified'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-shell-muted">{k}</dt>
                <dd className="mt-1 text-xl font-semibold text-shell-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-shell-muted">
          Demo tenant · {db.organization.legalName} · {db.employees.filter((e) => e.status === 'active').length} active employees
        </p>
      </div>

      {/* ------------------------------------------------------- form side */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden"><MeridianWordmark size={32} tone="ink" /></div>

          {step === 'persona' ? (
            <>
              <h2 className="text-xl font-semibold">Sign in</h2>
              <p className="mt-1.5 text-sm text-muted">
                Choose a role to explore. Each account has genuinely different permissions,
                navigation and data access.
              </p>

              <ul className="mt-6 space-y-2">
                {personas.map(({ role, userId }) => {
                  const u = db.users.find((x) => x.id === userId)!;
                  const emp = db.employees.find((e) => e.id === u.employeeId);
                  const meta = ROLES.find((r) => r.id === role)!;
                  const job = emp ? db.jobTitles.find((j) => j.id === emp.jobTitleId) : null;
                  return (
                    <li key={userId}>
                      <button
                        onClick={() => { setSelected(userId); setStep('password'); setError(''); }}
                        className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-all hover:border-brand-300 hover:shadow-raised"
                      >
                        {emp ? <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={38} /> : null}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{u.displayName}</span>
                            <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-brand-700">
                              {meta.short}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">{job?.name ?? meta.label}</span>
                          <span className="mt-0.5 block truncate text-[0.7rem] text-faint">{meta.blurb}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 border-t border-line pt-5">
                <p className="mb-2 text-xs font-medium text-muted">Or sign in as any employee</p>
                <SearchInput value={query} onChange={setQuery} placeholder="Search all employee accounts…" />
                {searchResults.length ? (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {searchResults.map((u) => (
                      <li key={u.id}>
                        <button
                          onClick={() => { setSelected(u.id); setStep('password'); setQuery(''); }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-sunken"
                        >
                          <span className="truncate">{u.displayName}</span>
                          <span className="shrink-0 text-xs text-faint">{u.roles.length} role{u.roles.length === 1 ? '' : 's'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 'password' && selectedUser ? (
            <form onSubmit={submitPassword}>
              <button type="button" onClick={() => { setStep('persona'); setError(''); }} className="text-xs text-muted hover:text-ink">
                ← Choose a different account
              </button>
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-sunken p-3">
                {selectedEmployee ? (
                  <Avatar first={selectedEmployee.firstName} last={selectedEmployee.lastName} seed={selectedEmployee.avatarSeed} size={40} />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedUser.displayName}</p>
                  <p className="truncate text-xs text-muted">{selectedUser.email}</p>
                </div>
              </div>

              <h2 className="mt-6 text-lg font-semibold">Enter your password</h2>
              <p className="mt-1 text-sm text-muted">This is a demo environment — any password of four or more characters is accepted.</p>

              <Field className="mt-4" label="Password" htmlFor="pw">
                <Input
                  id="pw" type="password" value={password} autoFocus
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              {error ? <p className="mt-2 text-xs text-danger-600">{error}</p> : null}

              <Button type="submit" variant="primary" size="md" block className="mt-5" icon={Lock}>
                Continue
              </Button>

              <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
                <ShieldCheck className="h-3.5 w-3.5" />
                {selectedUser.mfaEnabled
                  ? `Multi-factor authentication is enabled (${selectedUser.mfaMethod}).`
                  : 'Multi-factor authentication is not enabled on this account.'}
              </p>
            </form>
          ) : null}

          {step === 'mfa' && selectedUser ? (
            <form onSubmit={submitMfa}>
              <button type="button" onClick={() => { setStep('password'); setError(''); }} className="text-xs text-muted hover:text-ink">
                ← Back
              </button>
              <span className="mt-5 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                {selectedUser.mfaMethod === 'sms' ? <Smartphone className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              </span>
              <h2 className="mt-4 text-lg font-semibold">Two-factor verification</h2>
              <p className="mt-1 text-sm text-muted">
                Enter the 6-digit code from your {selectedUser.mfaMethod === 'sms' ? 'text message' : 'authenticator app'}.
                Any six digits work here.
              </p>
              <Field className="mt-4" label="Verification code" htmlFor="mfa">
                <Input
                  id="mfa" inputMode="numeric" maxLength={6} autoFocus value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={cx('tracking-[0.5em] text-center font-medium')}
                />
              </Field>
              {error ? <p className="mt-2 text-xs text-danger-600">{error}</p> : null}
              <Button type="submit" variant="primary" size="md" block className="mt-5">Verify and sign in</Button>
            </form>
          ) : null}

          <p className="mt-10 text-center text-[0.7rem] leading-relaxed text-faint">
            Meridian HCM is an original demonstration platform. All people, pay and company data shown
            is fictional and generated locally in your browser.
          </p>
        </div>
      </div>
    </div>
  );
};
