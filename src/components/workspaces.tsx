'use client';
import { ui } from '@/lib/i18n/ui';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Plus,
  Check,
  ArrowUpRight,
  Leaf,
  Shield,
  Copy,
  RefreshCw,
  Mail,
  Trash2,
  Sprout,
  BookOpen,
  Code,
  Sparkles,
} from 'lucide-react';
import { useApp } from './app-context';
import { Button, IconButton, Panel, Field, Dialog } from './ui';
import { en } from '@/lib/i18n/en';
import { billingCopy, invoiceStatusLabels, subscriptionStatusLabels } from '@/lib/i18n/billing';
import styles from './workspaces.module.css';
import {
  DEFAULT_BILLING_POLICY,
  type BillingTier,
  type BillingInterval,
  formatStripeAmount,
} from '@/lib/billing/config';
import type { Entitlements } from '@/lib/billing/entitlements';
import type { InvitationEmailStatus } from '@/lib/server/invitation-mail';
import {
  applyOrganizationDefaults,
  organizationDefaults,
  type OrganizationDefaults,
  type WorkspaceIcon,
} from '@/lib/workspace-settings';

type Member = { user_id: string; role: string; display_name: string };
type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
};
type OrgDetails = {
  role: string;
  members: Member[];
  invitations: Invitation[];
  icon: WorkspaceIcon;
  defaults: OrganizationDefaults;
  invitationEmailAvailable: boolean;
};
const roleLabels: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  member: 'Membre',
  viewer: 'Lecteur',
};
const invitationEmailLabels: Record<InvitationEmailStatus, string> = {
  not_requested: 'Invitation créée. Copiez le lien pour le transmettre à votre collègue.',
  not_configured: 'Invitation créée. L’envoi par e-mail est indisponible ; partagez le lien.',
  accepted:
    'Invitation créée et e-mail pris en charge par le service d’envoi. La réception n’est pas encore confirmée.',
  failed: 'Invitation créée, mais le service a refusé l’e-mail. Vous pouvez partager le lien.',
  unknown:
    'Invitation créée. L’envoi de l’e-mail n’a pas pu être confirmé ; le lien reste utilisable.',
};
const workspaceIcons = {
  leaf: Leaf,
  sprout: Sprout,
  book: BookOpen,
  code: Code,
  sparkles: Sparkles,
};
const organizationNumberFields = [
  { key: 'focusMinutes', label: en.organization.defaults.focus, min: 1, max: 180 },
  { key: 'shortBreakMinutes', label: en.organization.defaults.shortBreak, min: 1, max: 60 },
  { key: 'longBreakMinutes', label: en.organization.defaults.longBreak, min: 1, max: 120 },
  { key: 'cycleLength', label: en.organization.defaults.cycle, min: 1, max: 12 },
  { key: 'visibleStartHour', label: en.organization.defaults.startHour, min: 0, max: 23 },
  { key: 'visibleEndHour', label: en.organization.defaults.endHour, min: 1, max: 24 },
] as const;
export function OrganizationPage() {
  const { store, notify, navigate } = useApp();
  const [loadedDetails, setDetails] = useState<{
    value: OrgDetails;
    workspaceId: string;
    accountId: string;
  } | null>(null);
  const details =
    loadedDetails?.workspaceId === store.workspaceId && loadedDetails.accountId === store.user?.id
      ? loadedDetails.value
      : null;
  const loadVersion = useRef(0);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdInvitation, setCreatedInvitation] = useState<{
    url: string;
    status: InvitationEmailStatus;
    workspaceId: string;
    accountId: string | undefined;
  } | null>(null);
  const visibleInvitation =
    createdInvitation?.workspaceId === store.workspaceId &&
    createdInvitation.accountId === store.user?.id
      ? createdInvitation
      : null;
  const inviteUrl = visibleInvitation?.url || '';
  const [confirmation, setConfirmation] = useState<{
    action: string;
    memberId?: string;
    invitationId?: string;
  } | null>(null);
  const [transferText, setTransferText] = useState('');
  const [token, setToken] = useState('');
  const isOrg = store.currentWorkspace?.kind === 'organization';
  const canManage =
    store.currentWorkspace?.role === 'owner' || store.currentWorkspace?.role === 'admin';
  const defaults = details?.defaults || organizationDefaults();
  const OrganizationIcon = workspaceIcons[details?.icon || 'leaf'];
  const load = useCallback(async () => {
    if (!store.user) return;
    const version = ++loadVersion.current;
    try {
      const response = await fetch(`/api/workspaces?workspaceId=${store.workspaceId}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (version !== loadVersion.current) return false;
      setDetails({ value: data, workspaceId: store.workspaceId, accountId: store.user.id });
      setLoadedAt(Date.now());
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [store.user, store.workspaceId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
    };
  }, [load]);
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.inviteUrl)
        setCreatedInvitation({
          url: data.inviteUrl,
          status: data.emailStatus || 'not_requested',
          workspaceId: store.workspaceId,
          accountId: store.user?.id,
        });
      await store.refreshAccount();
      if (data.workspaceId && ['create', 'acceptInvite'].includes(String(body.action)))
        await store.selectWorkspace(data.workspaceId);
      else await load();
      notify(data.inviteUrl ? 'Invitation créée.' : ui.workspaces.workspaceUpdated);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="scope-notice">
        <Shield size={16} />
        {en.organization.private}
      </p>
      {!store.user && (
        <div className="notice">
          {en.organization.unconfigured}
          <Button variant="secondary" onClick={() => navigate('settings')}>
            {en.account.signIn}
          </Button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="organization-grid">
        <Panel
          title={en.organization.create}
          subtitle={ui.workspaces.giveASharedProjectAPlaceToGrow}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await action({ action: 'create', name: String(f.get('name')) });
            }}
          >
            <Field label={en.organization.name}>
              <input
                name="name"
                required
                maxLength={100}
                placeholder={ui.workspaces.eGTheDesignStudio}
              />
            </Field>
            <p className="helper">{ui.workspaces.createAnOrganizationThenActivateItsTeamPlanTo}</p>
            <Button type="submit" disabled={!store.user || busy}>
              <Plus size={16} />
              {en.organization.create}
            </Button>
          </form>
        </Panel>
        <Panel title={en.organization.accept} subtitle={ui.workspaces.joinThePeopleYouWorkWith}>
          <Field label={ui.workspaces.invitationTokenOrLink}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={ui.workspaces.pasteYourInvitationLink}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!store.user || !token || busy}
            onClick={async () => {
              let value = token;
              try {
                value = new URL(token).searchParams.get('invite') || token;
              } catch {
                /* A raw token can be pasted instead of a full URL. */
              }
              if (await action({ action: 'acceptInvite', token: value })) setToken('');
            }}
          >
            {ui.workspaces.acceptInvitation}
          </Button>
        </Panel>
      </div>
      {isOrg && (
        <>
          <Panel
            title={ui.workspaces.workspaceSettings}
            subtitle={`Organisation partagée · Votre rôle : ${roleLabels[store.currentWorkspace?.role || 'member']}`}
          >
            <p className="scope-notice">
              <OrganizationIcon size={20} />
              {en.organization.defaults.icons[details?.icon || 'leaf']}
            </p>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await action({
                  action: 'rename',
                  workspaceId: store.workspaceId,
                  name: String(f.get('name')),
                });
              }}
            >
              <input
                name="name"
                aria-label={ui.workspaces.workspaceName}
                defaultValue={store.currentWorkspace?.name}
                required
                maxLength={100}
              />
              <Button type="submit" disabled={!canManage || busy}>
                {ui.workspaces.renameWorkspace}
              </Button>
            </form>
          </Panel>
          {details && (
            <Panel title={en.organization.defaults.title} subtitle={en.organization.defaults.hint}>
              <form
                key={`${store.workspaceId}:${JSON.stringify(details.defaults)}:${details.icon}`}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const defaultPreferences = Object.fromEntries(
                    organizationNumberFields.map(({ key }) => [key, Number(form.get(key))]),
                  );
                  await action({
                    action: 'settings',
                    workspaceId: store.workspaceId,
                    icon: String(form.get('icon')),
                    defaultPreferences: {
                      ...defaultPreferences,
                      weekStartsOn: Number(form.get('weekStartsOn')),
                    },
                  });
                }}
              >
                <fieldset
                  style={{ border: 0, padding: 0, minWidth: 0 }}
                  disabled={!canManage || busy || store.currentWorkspace?.plan !== 'team'}
                >
                  <legend className="sr-only">{en.organization.defaults.title}</legend>
                  <div className="form-grid">
                    <Field label={en.organization.defaults.icon}>
                      <select name="icon" defaultValue={details.icon}>
                        {Object.keys(workspaceIcons).map((icon) => (
                          <option value={icon} key={icon}>
                            {en.organization.defaults.icons[icon as WorkspaceIcon]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={en.organization.defaults.weekStart}>
                      <select name="weekStartsOn" defaultValue={defaults.weekStartsOn}>
                        <option value="1">{en.organization.defaults.monday}</option>
                        <option value="0">{en.organization.defaults.sunday}</option>
                      </select>
                    </Field>
                    {organizationNumberFields.map(({ key, label, min, max }) => (
                      <Field key={key} label={label}>
                        <input
                          name={key}
                          type="number"
                          min={min}
                          max={max}
                          step="1"
                          required
                          defaultValue={defaults[key]}
                        />
                      </Field>
                    ))}
                  </div>
                  <Button
                    type="submit"
                    disabled={!canManage || busy || store.currentWorkspace?.plan !== 'team'}
                  >
                    {en.organization.defaults.save}
                  </Button>
                </fieldset>
              </form>
              {store.currentWorkspace?.plan !== 'team' && (
                <p className="helper">{en.organization.defaults.teamRequired}</p>
              )}
              <p className="helper">{en.organization.defaults.applyHint}</p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await store.update((draft) => {
                      draft.preferences = applyOrganizationDefaults(draft.preferences, defaults);
                    })
                  )
                    notify(en.organization.defaults.applied);
                }}
              >
                {en.organization.defaults.apply}
              </Button>
            </Panel>
          )}
          <Panel
            title={en.organization.members}
            subtitle={ui.workspaces.clearRolesHelpEveryoneWorkComfortably}
          >
            {details?.members.map((member) => (
              <div className="member-row" key={member.user_id}>
                <span className="avatar">{member.display_name.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>
                    {member.user_id === store.userId ? ui.workspaces.you : member.display_name}
                  </strong>
                  <small>{roleLabels[member.role] || member.role}</small>
                </div>
                {canManage &&
                member.role !== 'owner' &&
                (store.currentWorkspace?.role === 'owner' || member.role !== 'admin') ? (
                  <>
                    <select
                      aria-label={`Rôle de ${member.display_name}`}
                      value={member.role}
                      disabled={busy}
                      onChange={(e) =>
                        action({
                          action: 'setRole',
                          workspaceId: store.workspaceId,
                          memberId: member.user_id,
                          role: e.target.value,
                        })
                      }
                    >
                      {(store.currentWorkspace?.role === 'owner'
                        ? ['admin', 'member', 'viewer']
                        : ['member', 'viewer']
                      ).map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      label={`Retirer ${member.display_name}`}
                      onClick={() =>
                        setConfirmation({
                          action: 'removeMember',
                          memberId: member.user_id,
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </IconButton>
                    {store.currentWorkspace?.role === 'owner' && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setConfirmation({
                            action: 'transferOwnership',
                            memberId: member.user_id,
                          })
                        }
                      >
                        {ui.workspaces.transferOwnership}
                      </Button>
                    )}
                  </>
                ) : (
                  <span className="badge">{roleLabels[member.role] || member.role}</span>
                )}
              </div>
            ))}
            {!details && <p className="helper">{ui.workspaces.loadingMembers}</p>}
            <div className="permission-summary">
              <p>
                <strong>{ui.workspaces.owner}</strong>{' '}
                {ui.workspaces.billingOwnershipMembersAndContent}
              </p>
              <p>
                <strong>{ui.workspaces.admin}</strong>{' '}
                {ui.workspaces.workspaceSettingsMembersAndContent}
              </p>
              <p>
                <strong>{ui.workspaces.member}</strong>{' '}
                {ui.workspaces.sharedWorkAndOwnFocusSessions}
              </p>
              <p>
                <strong>{ui.workspaces.viewer}</strong>{' '}
                {ui.workspaces.readOnlyAccessToSharedContent}
              </p>
            </div>
          </Panel>
          {canManage && (
            <Panel title={en.organization.invitations} subtitle={en.organization.inviteHint}>
              <form
                className={`invite-form ${styles.inviteForm}`}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await action({
                    action: 'invite',
                    workspaceId: store.workspaceId,
                    email: String(f.get('email')),
                    role: String(f.get('role')),
                    sendEmail: f.get('sendEmail') === 'on',
                  });
                }}
              >
                <input
                  type="email"
                  name="email"
                  aria-label={en.organization.email}
                  placeholder={ui.workspaces.teammateExampleCom}
                  required
                />
                <select name="role" aria-label={en.organization.role}>
                  <option value="member">{ui.workspaces.member}</option>
                  <option value="viewer">{ui.workspaces.viewer}</option>
                  {store.currentWorkspace?.role === 'owner' && (
                    <option value="admin">{ui.workspaces.admin}</option>
                  )}
                </select>
                <label className={styles.emailOption}>
                  <input
                    type="checkbox"
                    name="sendEmail"
                    disabled={busy || !details?.invitationEmailAvailable}
                  />
                  Envoyer aussi l’invitation par e-mail
                </label>
                <Button type="submit" disabled={busy || store.currentWorkspace?.plan !== 'team'}>
                  <Mail size={16} />
                  {en.organization.invite}
                </Button>
              </form>
              {!details?.invitationEmailAvailable && (
                <p className="helper">
                  L’envoi par e-mail est indisponible. Vous pouvez partager un lien d’invitation.
                </p>
              )}
              {store.currentWorkspace?.plan !== 'team' && (
                <p className="notice">
                  {ui.workspaces.invitationsRequireAnActiveTeamSubscription}
                  <Button variant="ghost" onClick={() => navigate('billing')}>
                    {ui.workspaces.viewTeamPlan}
                  </Button>
                </p>
              )}
              {visibleInvitation && (
                <p className="notice" role="status">
                  {invitationEmailLabels[visibleInvitation.status]}
                </p>
              )}
              {inviteUrl && (
                <div className="invite-result">
                  <p>{ui.workspaces.invitationCreatedShareThisLinkWithYourTeammate}</p>
                  <input
                    readOnly
                    value={inviteUrl}
                    aria-label={ui.workspaces.createdInvitationLink}
                  />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        notify(ui.workspaces.invitationLinkCopied);
                      } catch {
                        notify(ui.workspaces.selectAndCopyTheInvitationLink);
                      }
                    }}
                  >
                    <Copy size={15} />
                    {ui.workspaces.copyLink}
                  </Button>
                </div>
              )}
              {details?.invitations.map((invite) => (
                <div key={invite.id} className="invitation-row">
                  <div>
                    <strong>{invite.email}</strong>
                    <small>
                      {roleLabels[invite.role] || invite.role} {ui.workspaces.copy}{' '}
                      {invite.accepted_at
                        ? ui.workspaces.accepted
                        : invite.revoked_at
                          ? ui.workspaces.revoked
                          : Date.parse(invite.expires_at) < loadedAt
                            ? ui.workspaces.expired
                            : `Expire le ${new Date(invite.expires_at).toLocaleDateString('fr-FR')}`}
                    </small>
                  </div>
                  {!invite.accepted_at && !invite.revoked_at && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setConfirmation({
                          action: 'revokeInvite',
                          invitationId: invite.id,
                        })
                      }
                    >
                      {en.organization.revoke}
                    </Button>
                  )}
                </div>
              ))}
            </Panel>
          )}
        </>
      )}
      {confirmation && (
        <Dialog
          title={
            confirmation.action === 'transferOwnership'
              ? ui.workspaces.transferWorkspaceOwnership
              : confirmation.action === 'removeMember'
                ? ui.workspaces.removeThisMember
                : ui.workspaces.revokeThisInvitation
          }
          onClose={() => {
            setConfirmation(null);
            setTransferText('');
          }}
        >
          <p>
            {confirmation.action === 'transferOwnership'
              ? ui.workspaces.youWillBecomeAnAdminBillingAndOwnershipControls
              : ui.workspaces.accessWillBeRevokedExistingProductivityHistoryWillBe}
          </p>
          {confirmation.action === 'transferOwnership' && (
            <Field label={ui.workspaces.typeTransferToConfirm}>
              <input value={transferText} onChange={(e) => setTransferText(e.target.value)} />
            </Field>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              {en.common.cancel}
            </Button>
            <Button
              variant="danger"
              disabled={
                busy || (confirmation.action === 'transferOwnership' && transferText !== 'TRANSFER')
              }
              onClick={async () => {
                if (
                  await action({
                    ...confirmation,
                    workspaceId: store.workspaceId,
                    ...(confirmation.action === 'transferOwnership'
                      ? { confirmation: 'TRANSFER' }
                      : {}),
                  })
                ) {
                  setConfirmation(null);
                  setTransferText('');
                }
              }}
            >
              {ui.workspaces.confirm}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
type Price = {
  tier: 'pro' | 'team';
  interval: BillingInterval;
  priceId: string;
  currency: string;
  unitAmount: number;
  formattedAmount: string;
  checkoutAvailable: boolean;
};
type Invoice = {
  id: string;
  number: string | null;
  status: string;
  total: number;
  currency: string;
  created: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};
type BillingState = {
  configured: boolean;
  checkoutEnabled: boolean;
  message?: string;
  error?: string;
  mode: 'test' | 'live' | null;
  prices: Price[];
  canManage?: boolean;
  portalAvailable?: boolean;
  entitlements?: Entitlements;
  subscription?: {
    tier: BillingTier;
    status: string;
    currentPeriodEnd: string | null;
    paidThrough: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
  } | null;
  invoices?: Invoice[];
};
export function BillingPage() {
  const { store, notify, navigate, openAccount } = useApp();
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [loadedBilling, setBilling] = useState<{ value: BillingState; scope: string } | null>(null);
  const billingScope = `${store.user?.id || 'public'}:${store.workspaceId}`;
  const billing = loadedBilling?.scope === billingScope ? loadedBilling.value : null;
  const loadVersion = useRef(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState('');
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const path = store.user
        ? `/api/billing?workspaceId=${store.workspaceId}`
        : '/api/billing/prices';
      const response = await fetch(path, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Impossible de vérifier la disponibilité des forfaits.');
      if (version !== loadVersion.current) return false;
      setBilling({ value: data, scope: billingScope });
      setError('');
      return true;
    } catch (e) {
      if (version !== loadVersion.current) return false;
      setBilling(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [store.user, store.workspaceId, billingScope]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCheckout(new URLSearchParams(window.location.search).get('checkout') || '');
      void load();
    }, 0);
    return () => {
      clearTimeout(timeout);
      loadVersion.current += 1;
    };
  }, [load]);
  async function openBilling(kind: 'checkout' | 'portal', tier?: 'pro' | 'team') {
    if (
      kind === 'checkout' &&
      (!billing?.configured ||
        !billing.checkoutEnabled ||
        !billing.mode ||
        !billing.canManage ||
        !billing.prices.some(
          (price) => price.tier === tier && price.interval === interval && price.checkoutAvailable,
        ))
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/billing/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: store.workspaceId,
          ...(kind === 'checkout' ? { tier, interval } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const destination = new URL(body.url);
      if (
        destination.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(destination.hostname)
      )
        throw new Error('Stripe n’a pas fourni de destination de paiement autorisée.');
      window.location.assign(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  const active = billing?.entitlements?.tier || 'free';
  const hasSubscription = !!(
    billing?.subscription &&
    !['none', 'canceled', 'incomplete_expired'].includes(billing.subscription.status)
  );
  const launchClosed = !!(billing?.configured && billing.mode && !billing.checkoutEnabled);
  async function refreshBilling() {
    if (await load()) {
      if (store.user) await store.refreshAccount();
      notify(ui.workspaces.billingStatusRefreshed);
    }
  }
  return (
    <>
      <div className="billing-top">
        <span className="badge">
          <Shield size={13} />
          {billing?.mode === 'test'
            ? en.billing.test
            : billing?.mode === 'live'
              ? billingCopy.liveMode
              : billingCopy.unavailableAction}
        </span>
        <div className="segmented">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              className={interval === value ? 'active' : ''}
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
            >
              {en.billing[value]}
            </button>
          ))}
        </div>
      </div>
      {checkout && (
        <p className="notice" role="status">
          {checkout === 'success'
            ? active !== 'free'
              ? billingCopy.activated
              : billingCopy.processing
            : en.billing.canceled}
          <Button variant="ghost" onClick={() => void refreshBilling()}>
            <RefreshCw size={15} />
            {billingCopy.refresh}
          </Button>
        </p>
      )}
      {!billing && !error ? (
        <p className="helper">{ui.workspaces.loadingPlanAvailability}</p>
      ) : (
        billing && !billing.configured && <p className="notice">{billingCopy.billingUnavailable}</p>
      )}
      {launchClosed && <p className="notice">{billingCopy.launchClosed}</p>}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} />
            {billingCopy.retry}
          </Button>
        </div>
      )}
      <div className="pricing-grid">
        {(['free', 'pro', 'team'] as const).map((tier) => {
          const price = billing?.prices?.find((p) => p.tier === tier && p.interval === interval);
          const correctScope =
            tier === 'pro'
              ? store.currentWorkspace?.kind === 'personal'
              : store.currentWorkspace?.kind === 'organization';
          const targetWorkspace = store.workspaces.find(
            (workspace) => workspace.kind === (tier === 'team' ? 'organization' : 'personal'),
          );
          const readyToCheckout = !!(
            billing?.configured &&
            billing.checkoutEnabled &&
            billing.mode &&
            price?.checkoutAvailable
          );
          const actionLabel =
            tier === 'free'
              ? billingCopy.customizeFree
              : !store.user
                ? launchClosed
                  ? en.account.signIn
                  : billingCopy.signIn
                : !correctScope
                  ? tier === 'team'
                    ? billingCopy.switchOrganization
                    : billingCopy.switchPersonal
                  : hasSubscription
                    ? en.billing.portal
                    : !readyToCheckout
                      ? launchClosed
                        ? billingCopy.launchClosedAction
                        : billingCopy.unavailableAction
                      : tier === 'pro'
                        ? billingCopy.choosePro
                        : billingCopy.chooseTeam;
          const actionDisabled =
            busy ||
            (tier !== 'free' &&
              !!store.user &&
              correctScope &&
              (!billing?.canManage ||
                (hasSubscription ? !billing.portalAvailable : !readyToCheckout)));
          async function choosePlan() {
            if (tier === 'free') return navigate('settings');
            if (!store.user) return openAccount();
            if (!correctScope) {
              if (targetWorkspace) await store.selectWorkspace(targetWorkspace.id);
              else navigate(tier === 'team' ? 'organization' : 'settings');
              return;
            }
            await openBilling(hasSubscription ? 'portal' : 'checkout', tier);
          }
          return (
            <section className={`pricing-card ${tier === 'pro' ? 'featured' : ''}`} key={tier}>
              <span className="plan-icon">
                {tier === 'team' ? (
                  <Users size={24} />
                ) : tier === 'pro' ? (
                  <Leaf size={24} />
                ) : (
                  <Check size={24} />
                )}
              </span>
              <h2>{en.billing[tier]}</h2>
              {tier === active && <span className="badge">{en.billing.current}</span>}
              <p>
                {tier === 'free'
                  ? billingCopy.freeDescription
                  : tier === 'pro'
                    ? billingCopy.proDescription
                    : billingCopy.teamDescription}
              </p>
              <div className="plan-price">
                {tier === 'free' ? (
                  <strong>{ui.workspaces.free}</strong>
                ) : price ? (
                  <>
                    <strong>{price.formattedAmount}</strong>
                    <span>{interval === 'month' ? billingCopy.perMonth : billingCopy.perYear}</span>
                  </>
                ) : (
                  <span className="price-unavailable">{ui.workspaces.priceNotConfigured}</span>
                )}
              </div>
              <Button
                variant={tier === 'pro' ? 'primary' : 'secondary'}
                disabled={actionDisabled}
                onClick={() => void choosePlan()}
              >
                {actionLabel}
              </Button>
              <ul>
                {billingCopy.features[tier].map((feature) => (
                  <li key={feature}>
                    <Check size={15} />
                    {feature}
                  </li>
                ))}
              </ul>
              {tier !== 'free' && price && (
                <small>
                  {interval === 'year' ? billingCopy.billedAnnually : billingCopy.billedMonthly}
                </small>
              )}
              {tier !== 'free' && store.user && correctScope && !billing?.canManage && (
                <small>{billingCopy.ownerOnly}</small>
              )}
              {tier !== 'free' && store.user && !correctScope && (
                <small>
                  {tier === 'team'
                    ? ui.workspaces.switchToAnOrganizationForTeam
                    : ui.workspaces.switchToYourPersonalWorkspaceForPro}
                </small>
              )}
            </section>
          );
        })}
      </div>
      <p className="helper centered">
        {billingCopy.usageDefaults(DEFAULT_BILLING_POLICY.plans.free)}
      </p>
      <p className="helper centered">{billingCopy.scope}</p>
      {billing?.mode === 'test' && <p className="helper centered">{billingCopy.testHint}</p>}
      {billing?.mode === 'live' && <p className="helper centered">{billingCopy.liveHint}</p>}
      <nav className="helper centered" aria-label={billingCopy.legalNavigation}>
        {billingCopy.legalLinks.map(({ href, label }, index) => (
          <span key={href}>
            {index > 0 && ' · '}
            <a href={href}>{label}</a>
          </span>
        ))}
      </nav>
      {store.user ? (
        <Panel title={ui.workspaces.workspaceBilling} subtitle={store.currentWorkspace?.name}>
          <div className="mini-metrics">
            <div>
              <strong>{en.billing[active]}</strong>
              <span>{ui.workspaces.effectivePlan}</span>
            </div>
            <div>
              <strong className="subscription-status">
                {billing?.subscription?.status
                  ? subscriptionStatusLabels[billing.subscription.status] || 'État indisponible'
                  : ui.workspaces.noSubscription}
              </strong>
              <span>{ui.workspaces.subscriptionStatus}</span>
            </div>
          </div>
          {billing?.subscription?.currentPeriodEnd && (
            <p>
              {ui.workspaces.currentPeriodEnds}{' '}
              {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}
              {ui.workspaces.copy3}
            </p>
          )}
          {billing?.subscription?.cancelAtPeriodEnd && (
            <p className="notice">{ui.workspaces.cancellationIsScheduledForTheEndOfTheBilling}</p>
          )}
          {billing?.subscription?.paidThrough && (
            <p>
              {ui.workspaces.paidAccessThrough}{' '}
              {new Date(billing.subscription.paidThrough).toLocaleDateString('fr-FR')}
              {ui.workspaces.copy3}
            </p>
          )}
          {billing?.subscription?.cancelAt && (
            <p>
              {ui.workspaces.cancellationDate}{' '}
              {new Date(billing.subscription.cancelAt).toLocaleDateString('fr-FR')}
              {ui.workspaces.copy3}
            </p>
          )}
          <Button
            variant="secondary"
            disabled={!billing?.portalAvailable || busy}
            onClick={() => openBilling('portal')}
          >
            {en.billing.portal}
            <ArrowUpRight size={15} />
          </Button>
          {billing?.canManage && hasSubscription && !billing.portalAvailable && (
            <p className="helper">{billingCopy.portalUnavailable}</p>
          )}
          {billing?.portalAvailable && <p className="helper">{billingCopy.cancelHint}</p>}
          {!billing?.canManage && (
            <p className="helper">{ui.workspaces.onlyTheWorkspaceOwnerCanManageBilling}</p>
          )}
          <h3>{en.billing.invoices}</h3>
          {billing?.invoices?.length ? (
            billing.invoices.map((invoice) => (
              <div className="invoice-row" key={invoice.id}>
                <div>
                  <strong>{invoice.number || ui.workspaces.invoice}</strong>
                  <span>
                    {new Date(invoice.created).toLocaleDateString('fr-FR')} {ui.workspaces.copy}{' '}
                    {invoiceStatusLabels[invoice.status] || 'État indisponible'}
                  </span>
                </div>
                <strong>{formatStripeAmount(invoice.total, invoice.currency)}</strong>
                {invoice.hostedInvoiceUrl && (
                  <a
                    className="button secondary"
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ui.workspaces.view}
                    <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="helper">{en.billing.noInvoices}</p>
          )}
        </Panel>
      ) : (
        <div className="billing-account">
          <p>{launchClosed ? billingCopy.accountHint : billingCopy.signInHint}</p>
          <Button variant="secondary" onClick={openAccount}>
            {en.account.signIn}
          </Button>
        </div>
      )}
    </>
  );
}
