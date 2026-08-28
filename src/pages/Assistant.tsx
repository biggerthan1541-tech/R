import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, Lock, Send, Sparkles, User } from 'lucide-react';
import {
  Alert, Badge, Button, Card, Input, SectionHeader, cx,
} from '@/components/ui';
import { useApp } from '@/lib/store';
import { SUGGESTIONS, ask } from '@/lib/assistant';
import type { AssistantAnswer } from '@/lib/assistant';

interface Turn {
  id: string;
  question: string;
  answer: AssistantAnswer;
}

export const AssistantPage = () => {
  const { db, today, employee, can, visibleIds, user } = useApp();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ctx = useMemo(
    () => ({ db, today, viewer: employee, can, visible: visibleIds }),
    [db, today, employee, can, visibleIds],
  );

  const suggestions = useMemo(
    () => SUGGESTIONS.filter((s) => !s.needs || can(s.needs)).slice(0, 8),
    [can],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, thinking]);

  const submit = (question: string) => {
    if (!question.trim()) return;
    setInput('');
    setThinking(true);
    window.setTimeout(() => {
      const answer = ask(ctx, question);
      setTurns((prev) => [...prev, { id: `${Date.now()}`, question, answer }]);
      setThinking(false);
    }, 360);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionHeader
        title="Meridian Assistant"
        subtitle="Ask about your workforce in plain language. Answers are computed from live records inside your permission scope."
      />

      {turns.length === 0 ? (
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <Bot className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Hello {employee?.preferredName}. Ask me anything about people, time, pay or hiring.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                I read the same records the rest of Meridian does and apply your role&apos;s data scope before
                answering — signed in as {user?.roles.join(', ')}, I will decline anything outside it rather
                than summarize around it.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-faint">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  onClick={() => submit(s.text)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="space-y-4">
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-white">
                <p className="text-sm">{t.question}</p>
                <User className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                t.answer.denied ? 'bg-warning-50 text-warning-600' : 'bg-brand-50 text-brand-700')}>
                {t.answer.denied ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </span>
              <Card className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-relaxed">{t.answer.headline}</p>
                {t.answer.detail ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.answer.detail}</p> : null}

                {t.answer.stats ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    {t.answer.stats.map((s) => (
                      <div key={s.label} className="well p-2.5">
                        <p className="text-2xs capitalize text-faint">{s.label}</p>
                        <p className="tnum mt-0.5 text-sm font-semibold">{s.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {t.answer.table ? (
                  <div className="scroll-x mt-3 rounded-lg border border-line" style={{ maxHeight: '20rem', overflowY: 'auto' }}>
                    <table className="dt">
                      <thead>
                        <tr>{t.answer.table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {t.answer.table.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, ci) => (
                              <td key={ci} className={cx(typeof cell === 'number' && 'text-right tnum', 'capitalize')}>
                                {String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {t.answer.path ? (
                  <Button className="mt-3" size="sm" iconRight={ArrowRight} onClick={() => navigate(t.answer.path!.to)}>
                    {t.answer.path.label}
                  </Button>
                ) : null}
              </Card>
            </div>
          </div>
        ))}

        {thinking ? (
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400"
                  style={{ animationDelay: `${i * 140}ms` }} />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-20 lg:bottom-4">
        <Card className="shadow-raised">
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="flex items-center gap-2"
          >
            <Bot className="h-4 w-4 shrink-0 text-brand-600" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about people, time, pay, hiring…"
              className="border-0 focus:ring-0"
            />
            <Button type="submit" variant="primary" icon={Send} disabled={!input.trim()}>Ask</Button>
          </form>
        </Card>
      </div>

      {turns.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 5).map((s) => (
            <button key={s.text} onClick={() => submit(s.text)}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand-300 hover:text-brand-800">
              {s.text}
            </button>
          ))}
        </div>
      ) : null}

      <Alert tone="neutral" icon={Lock} title="How permissions apply">
        The assistant resolves your data scope first — self, team or company — and only then aggregates.
        A manager asking about company payroll gets a refusal, not a partial answer.
        {' '}<Badge tone="brand" className="ml-1">{user?.roles.length} role(s) active</Badge>
      </Alert>
    </div>
  );
};
