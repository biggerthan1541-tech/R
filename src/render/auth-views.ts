import type { AuditRow, PortalLinkRow, UserRow } from '../db/tenant.ts';
import type { Role } from '../domain/roles.ts';
import { formatDateTime, html, raw } from './html.ts';
import { csrfField, page, type ViewContext } from './layout.ts';

export function loginPage(
  ctx: ViewContext,
  options: { error?: string; email?: string; notice?: string } = {},
): string {
  const body = html`
    <div class="signin">
      <h1 class="mb-2">Sign in</h1>
      <p class="lede">Readiness — compliance and cyber-insurance readiness for your clients.</p>

      ${options.notice ? html`<div class="ok">${options.notice}</div>` : ''}
      ${options.error ? html`<div class="err">${options.error}</div>` : ''}

      <form method="post" action="/login" class="card">
        ${csrfField(ctx)}
        <div class="mb-md">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" value="${options.email ?? ''}"
            autocomplete="username" required autofocus>
        </div>
        <div class="mb-xl">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required>
        </div>
        <button type="submit">Sign in</button>
      </form>
    </div>
  `;
  return page('Sign in', ctx, body);
}

export function usersPage(input: {
  ctx: ViewContext;
  users: UserRow[];
  roles: Role[];
  canManage: boolean;
  flash: { ok?: string; err?: string };
}): string {
  const { ctx, users, roles, canManage, flash } = input;

  const body = html`
    ${flash.err ? html`<div class="err">${flash.err}</div>` : ''}
    ${flash.ok ? html`<div class="ok">${flash.ok}</div>` : ''}

    <nav class="crumbs"><a href="/">Console</a></nav>
    <h1>People</h1>
    <p class="lede">Everyone with access to ${ctx.msp.name}. Roles are defined in <code>config/roles.json</code>.</p>

    <div class="card">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last signed in</th>${canManage ? html`<th></th>` : ''}</tr></thead>
        <tbody>
          ${users.map(
            (user) => html`<tr>
              <td><strong>${user.name}</strong></td>
              <td class="muted">${user.email}</td>
              <td>
                ${canManage
                  ? html`<form method="post" action="/users/${user.id}/role" class="inline-form">
                      ${csrfField(ctx)}
                      <select name="role" class="role-select">
                        ${roles.map(
                          (role) => html`<option value="${role.key}"
                            ${raw(role.key === user.role ? 'selected' : '')}>${role.label}</option>`,
                        )}
                      </select>
                      <button type="submit" class="linkish">Save</button>
                    </form>`
                  : html`<span class="pill recommended">${roles.find((r) => r.key === user.role)?.label ?? user.role}</span>`}
              </td>
              <td>
                <span class="pill ${raw(user.status === 'active' ? 'pass' : 'fail')}">${user.status}</span>
              </td>
              <td class="muted small">${user.last_login_at ? formatDateTime(user.last_login_at) : 'never'}</td>
              ${canManage
                ? html`<td>
                    <form method="post" action="/users/${user.id}/status" class="inline-form">
                      ${csrfField(ctx)}
                      <input type="hidden" name="status" value="${user.status === 'active' ? 'disabled' : 'active'}">
                      <button type="submit" class="linkish">${user.status === 'active' ? 'Disable' : 'Enable'}</button>
                    </form>
                  </td>`
                : ''}
            </tr>`,
          )}
        </tbody>
      </table>
    </div>

    ${canManage
      ? html`
          <h2>Add someone</h2>
          <form method="post" action="/users" class="card">
            ${csrfField(ctx)}
            <div class="row">
              <div><label for="name">Name</label><input type="text" id="name" name="name" required></div>
              <div><label for="email">Email</label><input type="email" id="email" name="email" required></div>
            </div>
            <div class="row mt-sm">
              <div>
                <label for="role">Role</label>
                <select id="role" name="role">
                  ${roles.map((role) => html`<option value="${role.key}">${role.label} — ${role.description}</option>`)}
                </select>
              </div>
              <div>
                <label for="password">Temporary password</label>
                <input type="text" id="password" name="password" minlength="12" required
                  placeholder="At least 12 characters">
              </div>
            </div>
            <div class="mt-md"><button type="submit">Add user</button></div>
          </form>
        `
      : ''}
  `;
  return page('People', ctx, body);
}

export function auditPage(input: { ctx: ViewContext; entries: AuditRow[]; chainOk: boolean }): string {
  const { ctx, entries, chainOk } = input;

  const body = html`
    <nav class="crumbs"><a href="/">Console</a></nav>
    <h1>Audit log</h1>
    <p class="lede">
      What operators did, and when. Separate from the evidence log, which records what clients'
      controls looked like. Both are append-only.
    </p>

    <div class="${raw(chainOk ? 'ok' : 'err')}">
      ${chainOk
        ? 'Hash chain verified — no entry has been altered, removed or reordered.'
        : 'Hash chain verification FAILED. This log has been tampered with.'}
    </div>

    <div class="card">
      <table class="t-audit">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>
          ${entries.map(
            (entry) => html`<tr>
              <td class="small nowrap">${formatDateTime(entry.occurred_at)}</td>
              <td class="small break-word">${entry.actor_label}</td>
              <td class="small"><code>${entry.action}</code></td>
              <td class="small muted break-word">
                ${entry.subject_type ? html`${entry.subject_type} ${entry.subject_id} ` : ''}
                ${describeDetail(entry.detail)}
              </td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  `;
  return page('Audit log', ctx, body);
}

function describeDetail(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    const pairs = Object.entries(parsed);
    if (pairs.length === 0) return '';
    return pairs.map(([key, value]) => `${key}=${String(value)}`).join(' · ');
  } catch {
    return detail;
  }
}

export function portalLinksSection(
  ctx: ViewContext,
  clientId: string,
  links: PortalLinkRow[],
  options: { canShare: boolean; canRevoke: boolean; issued?: { url: string; expiresAt: string } },
) {
  return html`
    <h2>Client portal links</h2>
    ${options.issued
      ? html`<div class="ok">
          <strong>Share this link with your client.</strong> It is read-only, shows only their own
          evidence pack, and expires ${formatDateTime(options.issued.expiresAt)}. It is shown once.
          <div class="mt-xs"><code class="break-all">${options.issued.url}</code></div>
        </div>`
      : ''}

    ${links.length === 0
      ? html`<div class="card"><p class="muted m0">No portal links issued yet.</p></div>`
      : html`<div class="card"><table>
          <thead><tr><th>Created</th><th>Expires</th><th>Views</th><th>Status</th>${options.canRevoke ? html`<th></th>` : ''}</tr></thead>
          <tbody>
            ${links.map((link) => {
              const expired = new Date(link.expires_at).getTime() <= Date.now();
              const state = link.revoked_at ? 'revoked' : expired ? 'expired' : 'active';
              return html`<tr>
                <td class="small">${formatDateTime(link.created_at)}<br /><span class="muted">${link.created_by}</span></td>
                <td class="small">${formatDateTime(link.expires_at)}</td>
                <td class="small">${link.view_count}${link.last_viewed_at ? html`<br /><span class="muted">last ${formatDateTime(link.last_viewed_at)}</span>` : ''}</td>
                <td><span class="pill ${raw(state === 'active' ? 'pass' : 'unknown')}">${state}</span></td>
                ${options.canRevoke
                  ? html`<td>
                      ${state === 'active'
                        ? html`<form method="post" action="/clients/${clientId}/portal/${link.id}/revoke" class="inline-form">
                            ${csrfField(ctx)}<button type="submit" class="linkish">Revoke</button>
                          </form>`
                        : ''}
                    </td>`
                  : ''}
              </tr>`;
            })}
          </tbody>
        </table></div>`}
  `;
}
