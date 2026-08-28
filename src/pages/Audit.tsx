import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, Column, DataTable, EmptyState,
  PermissionDenied, SearchInput, SectionHeader, Select, StatTile,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { downloadText, num, toCsv } from '@/lib/format';
import { addDays, fmtDateTime, timeAgo } from '@/lib/dates';
import type { AuditEntry } from '@/lib/types';

export const AuditPage = () => {
  const { db, can, today } = useApp();
  const lookups = useLookups();
  const [query, setQuery] = useState('');
  const [module, setModule] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [window, setWindow] = useState('30');

  if (!can('audit.view')) return <PermissionDenied what="the audit log" />;

  const modules = useMemo(() => [...new Set(db.auditLog.map((a) => a.module))].sort(), [db.auditLog]);
  const cutoff = addDays(today, -Number(window));

  const rows = db.auditLog
    .filter((a) => a.at.slice(0, 10) >= cutoff)
    .filter((a) => (module === 'all' ? true : a.module === module))
    .filter((a) => (severity === 'all' ? true : a.severity === severity))
    .filter((a) => {
      const q = query.trim().toLowerCase();
      return !q || `${a.actorName} ${a.action} ${a.objectLabel} ${a.objectType}`.toLowerCase().includes(q);
    });

  const critical = rows.filter((a) => a.severity === 'critical').length;

  const columns: Column<AuditEntry>[] = [
    {
      key: 'when', header: 'When', sortValue: (a) => a.at, width: '11rem',
      render: (a) => (
        <span>
          <span className="block text-sm">{timeAgo(a.at)}</span>
          <span className="block text-2xs text-faint">{fmtDateTime(a.at)}</span>
        </span>
      ),
    },
    {
      key: 'actor', header: 'Actor', sortValue: (a) => a.actorName,
      render: (a) => {
        const u = lookups.user.get(a.actorId);
        const e = u?.employeeId ? lookups.employee.get(u.employeeId) : null;
        return (
          <span className="flex items-center gap-2.5">
            {e ? <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={24} /> : null}
            <span className="min-w-0">
              <span className="block truncate text-sm">{a.actorName}</span>
              <span className="block truncate text-2xs text-faint">{a.device}</span>
            </span>
          </span>
        );
      },
    },
    { key: 'action', header: 'Action', sortValue: (a) => a.action, render: (a) => <span className="text-sm">{a.action}</span> },
    {
      key: 'object', header: 'Object', hideBelow: 'md',
      render: (a) => (
        <span>
          <span className="block text-sm">{a.objectLabel}</span>
          <span className="block text-2xs text-faint">{a.objectType}</span>
        </span>
      ),
    },
    {
      key: 'changes', header: 'Change', hideBelow: 'lg',
      render: (a) => a.changes.length ? (
        <span className="text-xs">
          {a.changes.map((c, i) => (
            <span key={i} className="block">
              <span className="text-faint">{c.field}:</span> {c.from} → <span className="font-medium">{c.to}</span>
            </span>
          ))}
        </span>
      ) : <span className="text-xs text-faint">—</span>,
    },
    { key: 'module', header: 'Module', align: 'center', hideBelow: 'sm', sortValue: (a) => a.module, render: (a) => <Badge tone="neutral">{a.module}</Badge> },
    {
      key: 'severity', header: 'Severity', align: 'center', sortValue: (a) => a.severity,
      render: (a) => (
        <Badge tone={a.severity === 'critical' ? 'danger' : a.severity === 'notice' ? 'warning' : 'neutral'}>
          {a.severity}
        </Badge>
      ),
    },
    { key: 'ip', header: 'IP', align: 'right', hideBelow: 'lg', render: (a) => <span className="font-mono text-2xs text-faint">{a.ipAddress}</span> },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Audit log"
        subtitle="An immutable record of who changed what, when, and from where."
        actions={
          <Button icon={Download} onClick={() => downloadText(`audit-log-${today}.csv`, toCsv(rows.map((a) => ({
            timestamp: a.at, actor: a.actorName, action: a.action, object_type: a.objectType,
            object: a.objectLabel, module: a.module, severity: a.severity,
            changes: a.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join('; '),
            ip: a.ipAddress, device: a.device,
          }))))}>
            Export
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Entries in window" value={num(rows.length)} icon={Shield} />
        <StatTile label="Critical actions" value={num(critical)} icon={ShieldAlert} tone={critical ? 'warning' : 'success'} />
        <StatTile label="Distinct actors" value={num(new Set(rows.map((a) => a.actorId)).size)} icon={ShieldCheck} tone="teal" />
        <StatTile label="Total retained" value={num(db.auditLog.length)} icon={Shield} tone="neutral" hint="Seven-year retention policy" />
      </div>

      <Alert tone="info" icon={Shield} title="What gets logged">
        Compensation changes, payroll approvals and finalization, role grants, session terminations, document
        access, signature events and every lifecycle action. Entries are append-only and cannot be edited
        or deleted from the interface.
      </Alert>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search actor, action or object…" className="min-w-[16rem] flex-1" />
          <Select value={module} onChange={(e) => setModule(e.target.value)} className="w-auto">
            <option value="all">All modules</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-auto">
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="notice">Notice</option>
            <option value="info">Info</option>
          </Select>
          <Select value={window} onChange={(e) => setWindow(e.target.value)} className="w-auto">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="3650">All time</option>
          </Select>
        </div>
        <DataTable rows={rows} columns={columns} getRowId={(a) => a.id} pageSize={20}
          initialSort={{ key: 'when', dir: 'desc' }}
          empty={<EmptyState icon={AlertTriangle} title="No audit entries match" body="Widen the time window or clear a filter." />} />
      </Card>
    </div>
  );
};
