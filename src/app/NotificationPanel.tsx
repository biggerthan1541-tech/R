import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { Badge, Button, EmptyState, cx } from '@/components/ui';
import { useApp } from '@/lib/store';
import { timeAgo } from '@/lib/dates';

const CHANNEL_ICON = {
  in_app: Bell, email: Mail, push: Smartphone, sms: MessageSquare,
} as const;

export const NotificationPanel = ({ onClose }: { onClose: () => void }) => {
  const { db, user, update } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');

  const mine = useMemo(
    () => db.notifications
      .filter((n) => n.userId === user?.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.notifications, user],
  );
  const list = (tab === 'unread' ? mine.filter((n) => !n.read) : mine).slice(0, 40);
  const unreadCount = mine.filter((n) => !n.read).length;

  const markAll = () => {
    update((draft) => {
      for (const n of draft.notifications) if (n.userId === user?.id) n.read = true;
    });
  };

  const open = (id: string, path: string | null) => {
    update((draft) => {
      const n = draft.notifications.find((x) => x.id === id);
      if (n) n.read = true;
    });
    if (path) navigate(path);
    onClose();
  };

  return (
    <div className="flex max-h-[32rem] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount ? <Badge tone="danger">{unreadCount} new</Badge> : null}
        </div>
        <Button size="xs" variant="ghost" icon={CheckCheck} onClick={markAll} disabled={!unreadCount}>
          Mark all read
        </Button>
      </div>

      <div className="flex gap-1 border-b border-line px-2 pt-2">
        {(['unread', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx('-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium capitalize transition-colors',
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink')}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <EmptyState compact icon={Bell} title="You're all caught up" body="New approvals, payroll updates and reminders show up here." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => open(n.id, n.actionPath)}
                  className={cx('flex w-full gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-sunken',
                    !n.read && 'bg-brand-50/40')}
                >
                  <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    n.severity === 'error' ? 'bg-danger-500' : n.severity === 'warning' ? 'bg-warning-500'
                      : n.severity === 'success' ? 'bg-success-500' : 'bg-brand-500',
                    n.read && 'opacity-30')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cx('truncate text-sm', n.read ? 'text-muted' : 'font-medium text-ink')}>{n.title}</span>
                      <span className="shrink-0 text-2xs text-faint">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted line-clamp-2">{n.body}</span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      {n.channels.map((c) => {
                        const Icon = CHANNEL_ICON[c];
                        return <Icon key={c} className="h-3 w-3 text-faint" aria-label={c} />;
                      })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
