import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check, CheckCircle2, Clock, Eye, FileSignature, Mail, PenLine, Send, ShieldCheck,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, Progress, SectionHeader, StageStepper, StatTile,
  StatusBadge, Tabs, Timeline, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { useAdminActions } from '@/lib/actions';
import { num } from '@/lib/format';
import { diffDays, fmtDate, fmtDateTime, timeAgo } from '@/lib/dates';
import type { SignatureRequest } from '@/lib/types';

const SIG_STAGES = [
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'viewed', label: 'Viewed' },
  { id: 'signed', label: 'Signed' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
];

export const SignaturesPage = () => {
  const { db, can, employee, today } = useApp();
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(requestId ? 'mine' : 'mine');
  const [signing, setSigning] = useState<SignatureRequest | null>(
    () => db.signatureRequests.find((r) => r.id === requestId) ?? null,
  );
  const [tracking, setTracking] = useState<SignatureRequest | null>(null);

  if (!can('documents.view.self', 'documents.manage')) return <PermissionDenied what="signatures" />;

  const mine = db.signatureRequests.filter((r) => r.signers.some((s) => s.employeeId === employee?.id));
  const pendingMine = mine.filter((r) => r.signers.some((s) => s.employeeId === employee?.id && s.state !== 'signed'));

  const tabs = [
    { id: 'mine', label: 'Awaiting my signature', count: pendingMine.length, icon: PenLine },
    ...(can('documents.manage') ? [{ id: 'sent', label: 'Requests I track', count: db.signatureRequests.length, icon: Send }] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Electronic signatures"
        subtitle="Every view and signature is timestamped and retained with the document version that was signed."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'mine' ? (
        <div className="space-y-4">
          {mine.length === 0 ? (
            <Card><EmptyState icon={CheckCircle2} title="Nothing awaiting your signature" body="Documents sent to you for signature appear here." /></Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {mine.map((r) => {
                const me = r.signers.find((s) => s.employeeId === employee?.id)!;
                const overdue = r.dueDate < today && me.state !== 'signed';
                return (
                  <li key={r.id}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.documentName}</p>
                          <p className="mt-0.5 text-xs text-muted">Version {r.documentVersion} · requested {timeAgo(r.createdAt)}</p>
                        </div>
                        <StatusBadge status={me.state} />
                      </div>
                      <p className={cx('mt-3 text-xs', overdue ? 'font-medium text-danger-600' : 'text-muted')}>
                        {me.state === 'signed'
                          ? `Signed ${me.signedAt ? fmtDate(me.signedAt.slice(0, 10)) : ''}`
                          : overdue ? `Overdue since ${fmtDate(r.dueDate)}` : `Due ${fmtDate(r.dueDate)} · ${diffDays(today, r.dueDate)} days left`}
                      </p>
                      {me.state !== 'signed' ? (
                        <Button className="mt-3" variant="primary" block icon={PenLine} onClick={() => setSigning(r)}>
                          Review and sign
                        </Button>
                      ) : (
                        <Button className="mt-3" block icon={Eye} onClick={() => setSigning(r)}>View signed copy</Button>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'sent' ? <SentRequests onTrack={setTracking} /> : null}

      <SignModal request={signing} onClose={() => { setSigning(null); if (requestId) navigate('/signatures', { replace: true }); }} />
      <TrackModal request={tracking} onClose={() => setTracking(null)} />
    </div>
  );
};

/* --------------------------------------------------------- sent view */

const SentRequests = ({ onTrack }: { onTrack: (r: SignatureRequest) => void }) => {
  const { db, today } = useApp();

  const rows = db.signatureRequests;
  const totals = useMemo(() => {
    const signers = rows.flatMap((r) => r.signers);
    return {
      requests: rows.length,
      signed: signers.filter((s) => s.state === 'signed').length,
      outstanding: signers.filter((s) => s.state !== 'signed').length,
      overdue: rows.filter((r) => r.dueDate < today).flatMap((r) => r.signers).filter((s) => s.state !== 'signed').length,
    };
  }, [rows, today]);

  const columns: Column<SignatureRequest>[] = [
    {
      key: 'doc', header: 'Document', sortValue: (r) => r.documentName,
      render: (r) => (
        <span>
          <span className="block text-sm font-medium">{r.documentName}</span>
          <span className="block text-xs text-muted">Version {r.documentVersion} · sent {fmtDate(r.createdAt.slice(0, 10))}</span>
        </span>
      ),
    },
    { key: 'recipients', header: 'Recipients', align: 'right', sortValue: (r) => r.signers.length, render: (r) => num(r.signers.length) },
    {
      key: 'progress', header: 'Completion', width: '14rem',
      sortValue: (r) => r.signers.filter((s) => s.state === 'signed').length / r.signers.length,
      render: (r) => {
        const signed = r.signers.filter((s) => s.state === 'signed').length;
        return (
          <div>
            <Progress value={(signed / r.signers.length) * 100} showValue tone={signed === r.signers.length ? 'success' : 'brand'} />
            <p className="mt-1 text-2xs text-faint">{signed} of {r.signers.length} signed</p>
          </div>
        );
      },
    },
    {
      key: 'due', header: 'Due', align: 'center', hideBelow: 'md', sortValue: (r) => r.dueDate,
      render: (r) => <Badge tone={r.dueDate < today ? 'danger' : 'neutral'}>{fmtDate(r.dueDate)}</Badge>,
    },
    { key: 'state', header: 'Status', align: 'center', sortValue: (r) => r.state, render: (r) => <StatusBadge status={r.state} /> },
    { key: 'go', header: '', align: 'right', render: (r) => <Button size="xs" onClick={() => onTrack(r)}>Track</Button> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active requests" value={num(totals.requests)} icon={FileSignature} />
        <StatTile label="Signatures collected" value={num(totals.signed)} icon={CheckCircle2} tone="success" />
        <StatTile label="Outstanding" value={num(totals.outstanding)} icon={Clock} tone="warning" />
        <StatTile label="Overdue" value={num(totals.overdue)} icon={Mail} tone={totals.overdue ? 'danger' : 'success'} />
      </div>

      <Card padded={false}>
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} pageSize={10}
          empty={<EmptyState icon={FileSignature} title="No signature requests" body="Send a document for signature from the Documents module." />} />
      </Card>
    </div>
  );
};

/* -------------------------------------------------------------- modals */

const SignModal = ({ request, onClose }: { request: SignatureRequest | null; onClose: () => void }) => {
  const { db, employee } = useApp();
  const { signDocument, markSignatureViewed } = useAdminActions();
  const [typed, setTyped] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (request && employee) markSignatureViewed(request.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  if (!request || !employee) return null;
  const me = request.signers.find((s) => s.employeeId === employee.id);
  const doc = db.documents.find((d) => d.id === request.documentId);
  const alreadySigned = me?.state === 'signed';
  const expected = `${employee.firstName} ${employee.lastName}`;

  return (
    <Modal
      open onClose={onClose} size="lg" icon={FileSignature}
      title={request.documentName}
      subtitle={`Version ${request.documentVersion} · due ${fmtDate(request.dueDate)}`}
      footer={
        alreadySigned ? <Button onClick={onClose}>Close</Button> : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={Check}
              disabled={!agreed || typed.trim().toLowerCase() !== expected.toLowerCase()}
              onClick={() => { signDocument(request.id, typed); onClose(); }}>
              Sign document
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-sunken p-5 text-xs leading-relaxed text-muted">
          <h4 className="text-sm font-semibold text-ink">{request.documentName}</h4>
          <p className="mt-3">
            This acknowledgement confirms that you have received, read and understood the policies contained in
            this document, and that you agree to comply with them as a condition of your continued employment
            with {db.organization.legalName}.
          </p>
          <p className="mt-3">
            The document covers standards of conduct, workplace safety, information security, time recording,
            expense reimbursement, anti-harassment and non-retaliation, and the procedures for raising concerns.
            Nothing in this document creates a contract of employment or alters the at-will nature of employment.
          </p>
          <p className="mt-3">
            Questions about anything in this document should be directed to People Operations. Where a policy
            conflicts with applicable law in your work location, the law controls and the policy is read to comply.
          </p>
          <p className="mt-3">
            Cardinal Peak may update these policies. Material changes are communicated in advance and may require
            a new acknowledgement, which will appear in your task list.
          </p>
          {doc ? <p className="mt-3 text-2xs text-faint">Document reference {doc.id} · {doc.sizeKb} KB · uploaded {fmtDate(doc.uploadedAt.slice(0, 10))}</p> : null}
        </div>

        {alreadySigned ? (
          <Alert tone="success" icon={CheckCircle2} title="You signed this document">
            Signed {me?.signedAt ? fmtDateTime(me.signedAt) : ''} as "{me?.signatureText}" from {me?.ipAddress}.
          </Alert>
        ) : (
          <>
            <Field label="Type your full legal name to sign" required hint={`Must match exactly: ${expected}`}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={expected}
                className="font-[cursive] text-lg" />
            </Field>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#5B3FD6]" />
              <span className="text-muted">
                I understand that typing my name constitutes a legally binding electronic signature under the
                E-SIGN Act, and that my signature, the timestamp and my network address are recorded.
              </span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
};

const TrackModal = ({ request, onClose }: { request: SignatureRequest | null; onClose: () => void }) => {
  const { db } = useApp();
  const lookups = useLookups();
  if (!request) return null;
  const signed = request.signers.filter((s) => s.state === 'signed').length;

  return (
    <Modal
      open onClose={onClose} size="lg" icon={ShieldCheck}
      title={request.documentName}
      subtitle={`${signed} of ${request.signers.length} signed · due ${fmtDate(request.dueDate)}`}
    >
      <div className="space-y-5">
        <StageStepper stages={SIG_STAGES} current={request.state} />

        <KeyValue columns={3} items={[
          { label: 'Requested by', value: lookups.user.get(request.requestedBy)?.displayName ?? 'System' },
          { label: 'Created', value: fmtDate(request.createdAt.slice(0, 10)) },
          { label: 'Document version', value: `v${request.documentVersion}` },
        ]} />

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Recipients</h4>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {request.signers.map((s) => {
              const e = lookups.employee.get(s.employeeId);
              return (
                <li key={s.employeeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {e ? <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={24} /> : null}
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{e?.preferredName} {e?.lastName}</span>
                      <span className="block truncate text-2xs text-faint">
                        {s.state === 'signed' ? `Signed ${s.signedAt ? fmtDateTime(s.signedAt) : ''} · ${s.ipAddress}`
                          : s.viewedAt ? `Viewed ${timeAgo(s.viewedAt)}` : 'Not yet opened'}
                      </span>
                    </span>
                  </span>
                  <StatusBadge status={s.state} />
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Audit trail</h4>
          <Timeline items={request.auditTrail.map((a, i) => ({
            id: String(i), title: a.event, meta: fmtDateTime(a.at),
            body: lookups.user.get(a.actorId)?.displayName ?? 'System',
          }))} />
        </div>

        {db.documents.find((d) => d.id === request.documentId)?.confidential ? (
          <Alert tone="warning" title="Confidential document">Only People Operations and the signer can retrieve the signed copy.</Alert>
        ) : null}
      </div>
    </Modal>
  );
};
