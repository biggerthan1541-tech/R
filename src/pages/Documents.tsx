import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Building2, Clock, Download, Eye, FileSignature, FileText, FolderOpen,
  Lock, Upload,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, Column, DataTable, EmptyState,
  Field, Input, KeyValue, Modal, PermissionDenied, SearchInput, SectionHeader, Select,
  StatTile, Tabs, Timeline, Toggle, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { useAdminActions } from '@/lib/actions';
import { expiringItems } from '@/lib/selectors';
import { num } from '@/lib/format';
import { addDays, diffDays, fmtDate } from '@/lib/dates';
import type { DocumentCategory, EmployeeDocument } from '@/lib/types';

const CATEGORIES: DocumentCategory[] = [
  'tax', 'payroll', 'benefits', 'policy', 'contract', 'performance', 'training', 'compliance', 'personal', 'onboarding',
];

export const DocumentsPage = () => {
  const { db, can, employee, visibleIds, today } = useApp();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('mine');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [detail, setDetail] = useState<EmployeeDocument | null>(
    () => db.documents.find((d) => d.id === params.get('doc')) ?? null,
  );
  const [uploading, setUploading] = useState(false);

  if (!can('documents.view.self', 'documents.view.team', 'documents.view.all')) {
    return <PermissionDenied what="documents" />;
  }

  const scope = visibleIds('documents');
  const visible = useMemo(() => db.documents.filter((d) => {
    if (!d.employeeId) return true;
    if (d.employeeId === employee?.id) return true;
    if (can('documents.view.all')) return true;
    if (can('documents.view.team') && scope.has(d.employeeId)) return !d.confidential;
    return false;
  }), [db.documents, employee, scope, can]);

  const filtered = visible
    .filter((d) => (tab === 'mine' ? d.employeeId === employee?.id
      : tab === 'company' ? !d.employeeId
      : tab === 'all' ? true : true))
    .filter((d) => (category === 'all' ? true : d.category === category))
    .filter((d) => {
      const q = query.trim().toLowerCase();
      return !q || d.name.toLowerCase().includes(q) || d.tags.join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const expiring = expiringItems(db, today, 60);

  const tabs = [
    { id: 'mine', label: 'My documents', icon: FileText },
    { id: 'company', label: 'Company library', icon: Building2 },
    ...(can('documents.view.all', 'documents.view.team') ? [{ id: 'all', label: 'All documents', icon: FolderOpen }] : []),
  ];

  const columns: Column<EmployeeDocument>[] = [
    {
      key: 'name', header: 'Document', sortValue: (d) => d.name,
      render: (d) => (
        <span className="flex items-center gap-2.5">
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg',
            d.confidential ? 'bg-warning-50 text-warning-600' : 'bg-sunken text-muted')}>
            {d.confidential ? <Lock className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{d.name}</span>
            <span className="block truncate text-xs text-muted">
              {d.sizeKb} KB · v{d.version}{d.tags.length ? ` · ${d.tags.join(', ')}` : ''}
            </span>
          </span>
        </span>
      ),
    },
    { key: 'category', header: 'Category', align: 'center', hideBelow: 'sm', sortValue: (d) => d.category, render: (d) => <Badge tone="neutral" className="capitalize">{d.category}</Badge> },
    {
      key: 'employee', header: 'Employee', hideBelow: 'lg',
      sortValue: (d) => lookups.employee.get(d.employeeId ?? '')?.lastName ?? '',
      render: (d) => {
        const e = d.employeeId ? lookups.employee.get(d.employeeId) : null;
        return e ? (
          <span className="flex items-center gap-2">
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={22} />
            <span className="truncate text-sm">{e.preferredName} {e.lastName}</span>
          </span>
        ) : <span className="text-xs text-faint">Company-wide</span>;
      },
    },
    { key: 'uploaded', header: 'Uploaded', hideBelow: 'md', sortValue: (d) => d.uploadedAt, render: (d) => <span className="text-sm">{fmtDate(d.uploadedAt.slice(0, 10))}</span> },
    {
      key: 'expires', header: 'Expires', align: 'center', hideBelow: 'lg', sortValue: (d) => d.expiresOn ?? '9999',
      render: (d) => {
        if (!d.expiresOn) return <span className="text-xs text-faint">—</span>;
        const days = diffDays(today, d.expiresOn);
        return <Badge tone={days < 0 ? 'danger' : days < 60 ? 'warning' : 'neutral'}>{days < 0 ? 'Expired' : `${days}d`}</Badge>;
      },
    },
    {
      key: 'signature', header: 'Signature', align: 'center', hideBelow: 'md',
      render: (d) => d.requiresSignature ? <Badge tone="brand" icon={FileSignature}>Required</Badge> : <span className="text-xs text-faint">—</span>,
    },
    { key: 'go', header: '', align: 'right', render: (d) => <Button size="xs" icon={Eye} onClick={() => setDetail(d)}>Open</Button> },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Documents"
        subtitle="Secure storage with per-record visibility rules, version history and expiration tracking."
        actions={can('documents.manage') ? <Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Upload</Button> : null}
      />

      {can('documents.view.all') ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Documents stored" value={num(db.documents.length)} icon={FolderOpen} />
          <StatTile label="Confidential" value={num(db.documents.filter((d) => d.confidential).length)} icon={Lock} tone="warning" />
          <StatTile label="Expiring in 60 days" value={num(expiring.filter((e) => diffDays(today, e.expires) >= 0).length)} icon={Clock} tone="accent" />
          <StatTile label="Awaiting signature" value={num(db.signatureRequests.reduce((s, r) => s + r.signers.filter((x) => x.state !== 'signed').length, 0))} icon={FileSignature} tone="brand" />
        </div>
      ) : null}

      {expiring.length && can('documents.view.all') ? (
        <Alert tone="warning" icon={AlertTriangle} title={`${expiring.length} certification(s) or document(s) expiring soon`}>
          {expiring.slice(0, 3).map((e) => {
            const emp = e.employeeId ? lookups.employee.get(e.employeeId) : null;
            return <p key={`${e.name}-${e.employeeId}`}>{emp ? `${emp.preferredName} ${emp.lastName} — ` : ''}{e.name} expires {fmtDate(e.expires)}</p>;
          })}
        </Alert>
      ) : null}

      <Tabs tabs={tabs} active={tab} onChange={(t) => { setTab(t); setParams({}, { replace: true }); }} />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search documents…" className="min-w-[16rem] flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </Select>
        </div>
        <DataTable rows={filtered} columns={columns} getRowId={(d) => d.id} pageSize={14}
          onRowClick={(d) => setDetail(d)}
          empty={<EmptyState icon={FolderOpen} title="No documents here" body="Documents you can access appear in this list." />} />
      </Card>

      <DocumentDrawer doc={detail} onClose={() => setDetail(null)} />
      <UploadModal open={uploading} onClose={() => setUploading(false)} />
    </div>
  );
};

const DocumentDrawer = ({ doc, onClose }: { doc: EmployeeDocument | null; onClose: () => void }) => {
  const { db, can } = useApp();
  const lookups = useLookups();
  const { requestSignatures } = useAdminActions();
  const [requesting, setRequesting] = useState(false);
  if (!doc) return null;

  const emp = doc.employeeId ? lookups.employee.get(doc.employeeId) : null;
  const uploader = lookups.user.get(doc.uploadedBy);
  const sigRequest = doc.signatureRequestId ? db.signatureRequests.find((r) => r.id === doc.signatureRequestId) : null;

  return (
    <>
      <Modal
        open onClose={onClose} size="lg" icon={FileText} title={doc.name}
        subtitle={`${doc.category} · version ${doc.version} · ${doc.sizeKb} KB`}
        footer={
          <>
            <Button icon={Download}>Download</Button>
            <div className="flex-1" />
            {can('documents.manage') && !sigRequest ? (
              <Button variant="primary" icon={FileSignature} onClick={() => setRequesting(true)}>Request signatures</Button>
            ) : <Button onClick={onClose}>Close</Button>}
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid h-48 place-items-center rounded-lg border border-dashed border-line-strong bg-sunken">
            <div className="text-center">
              <FileText className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-2 text-xs text-muted">Preview of {doc.name}</p>
            </div>
          </div>

          <KeyValue columns={2} items={[
            { label: 'Category', value: <span className="capitalize">{doc.category}</span> },
            { label: 'Visibility', value: <span className="capitalize">{doc.visibility}</span> },
            { label: 'Employee', value: emp ? `${emp.firstName} ${emp.lastName}` : 'Company-wide' },
            { label: 'Uploaded by', value: uploader?.displayName ?? 'System' },
            { label: 'Uploaded', value: fmtDate(doc.uploadedAt.slice(0, 10)) },
            { label: 'Expires', value: doc.expiresOn ? fmtDate(doc.expiresOn) : 'No expiration' },
            { label: 'Confidential', value: doc.confidential ? <Badge tone="warning">Restricted</Badge> : 'No' },
            { label: 'Signature required', value: doc.requiresSignature ? <Badge tone="brand">Yes</Badge> : 'No' },
          ]} />

          {sigRequest ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Signature status</h4>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{sigRequest.signers.filter((s) => s.state === 'signed').length} signed</Badge>
                <Badge tone="warning">{sigRequest.signers.filter((s) => s.state === 'viewed').length} viewed</Badge>
                <Badge tone="neutral">{sigRequest.signers.filter((s) => s.state === 'sent').length} not opened</Badge>
              </div>
            </div>
          ) : null}

          {doc.versions.length ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Version history</h4>
              <Timeline items={doc.versions.map((v) => ({
                id: String(v.version), title: `Version ${v.version}`,
                meta: fmtDate(v.at.slice(0, 10)), body: v.note,
              }))} />
            </div>
          ) : null}

          <Alert tone="neutral" icon={Lock} title="Access control">
            {doc.visibility === 'employee' ? 'Visible to the employee and People Operations only.'
              : doc.visibility === 'manager' ? 'Visible to the employee, their manager and People Operations.'
              : doc.visibility === 'hr' ? 'Restricted to People Operations and the employee.'
              : 'Visible to every employee in the company.'}
          </Alert>
        </div>
      </Modal>

      <SignatureRequestModal open={requesting} onClose={() => setRequesting(false)} documentId={doc.id}
        onSend={(ids, due) => { requestSignatures(doc.id, ids, due); setRequesting(false); onClose(); }} />
    </>
  );
};

const SignatureRequestModal = ({
  open, onClose, documentId, onSend,
}: { open: boolean; onClose: () => void; documentId: string; onSend: (ids: string[], due: string) => void }) => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const [selected, setSelected] = useState<string[]>([]);
  const [due, setDue] = useState(addDays(today, 14));
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  void documentId;

  const candidates = db.employees
    .filter((e) => e.status === 'active')
    .filter((e) => (scope === 'all' ? true : e.departmentId === scope))
    .filter((e) => {
      const q = query.trim().toLowerCase();
      return !q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q);
    });

  return (
    <Modal
      open={open} onClose={onClose} title="Request signatures" icon={FileSignature} size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <div className="flex-1" />
          <Button onClick={() => setSelected(candidates.map((c) => c.id))}>Select all {candidates.length}</Button>
          <Button variant="primary" disabled={!selected.length} onClick={() => onSend(selected, due)}>
            Send to {selected.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" required><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Limit to department">
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Everyone</option>
              {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={`Recipients (${selected.length} selected)`} required>
          <SearchInput value={query} onChange={setQuery} placeholder="Filter employees…" className="mb-2" />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {candidates.slice(0, 80).map((e) => (
              <li key={e.id} className="px-1">
                <Checkbox
                  checked={selected.includes(e.id)}
                  onChange={(v) => setSelected(v ? [...selected, e.id] : selected.filter((x) => x !== e.id))}
                  label={<span className="text-sm">{e.preferredName} {e.lastName}</span>}
                  description={lookups.jobTitle.get(e.jobTitleId)?.name}
                />
              </li>
            ))}
          </ul>
        </Field>
        <Alert tone="info" title="What recipients receive">
          An in-app notification, an email and a task in their queue. Every view and signature is timestamped
          with the signer's network address in the request's audit trail.
        </Alert>
      </div>
    </Modal>
  );
};

const UploadModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { db, employee } = useApp();
  const { uploadDocument } = useAdminActions();
  const [form, setForm] = useState({
    name: '', category: 'policy' as DocumentCategory, employeeId: '',
    visibility: 'company' as EmployeeDocument['visibility'], expiresOn: '',
    requiresSignature: false, confidential: false, tags: '',
  });

  return (
    <Modal
      open={open} onClose={onClose} title="Upload a document" icon={Upload}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.name}
            onClick={() => {
              uploadDocument({
                name: form.name, category: form.category,
                employeeId: form.employeeId || null, visibility: form.visibility,
                expiresOn: form.expiresOn || null, requiresSignature: form.requiresSignature,
                confidential: form.confidential,
                tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
              });
              onClose();
              setForm({ ...form, name: '', tags: '' });
            }}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid h-28 place-items-center rounded-lg border border-dashed border-line-strong bg-sunken text-center">
          <div>
            <Upload className="mx-auto h-5 w-5 text-faint" />
            <p className="mt-1.5 text-xs text-muted">Drop a file or choose one to upload</p>
          </div>
        </div>
        <Field label="Document name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Updated Remote Work Policy" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}>
              {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </Select>
          </Field>
          <Field label="Visibility">
            <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as EmployeeDocument['visibility'] })}>
              <option value="company">Everyone</option>
              <option value="manager">Employee and manager</option>
              <option value="hr">People Operations only</option>
              <option value="employee">Employee only</option>
            </Select>
          </Field>
          <Field label="Attach to employee" hint="Leave blank for a company-wide document.">
            <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Company-wide</option>
              {db.employees.filter((e) => e.status === 'active').slice(0, 80).map((e) => (
                <option key={e.id} value={e.id}>{e.preferredName} {e.lastName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expiration date"><Input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} /></Field>
          <Field label="Tags" className="sm:col-span-2">
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="policy, 2026, remote" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={form.requiresSignature} onChange={(v) => setForm({ ...form, requiresSignature: v })} label="Requires signature" />
          <Toggle checked={form.confidential} onChange={(v) => setForm({ ...form, confidential: v })} label="Confidential" />
        </div>
        {employee ? <p className="text-2xs text-faint">Uploaded as {employee.firstName} {employee.lastName} · recorded in the audit log.</p> : null}
      </div>
    </Modal>
  );
};
