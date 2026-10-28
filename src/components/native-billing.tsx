'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { appApiOrigin } from '@/lib/mobile-platform';
import { openExternalUrl } from '@/lib/mobile-files';
import {
  nativePurchases,
  nativePurchaseError,
  nativeStorePlatform,
  type NativePurchasePreparation,
  type NativePurchaseRecovery,
  type NativePurchaseScope,
} from '@/lib/native-purchases';
import { useApp } from './app-context';
import { Button, Panel } from './ui';

const legalLinks = [
  ['/terms', 'Conditions d’utilisation'],
  ['/privacy', 'Confidentialité'],
  ['/support', 'Assistance'],
] as const;

function recoveryMessage(result: NativePurchaseRecovery): string {
  if (result.pending)
    return 'La boutique attend la confirmation du paiement. Ne rachetez pas l’abonnement ; restaurez vos achats après sa confirmation.';
  if (result.unfinished)
    return 'Un achat reste à finaliser. Utilisez « Restaurer mes achats » pour réessayer sans payer de nouveau.';
  return result.verified
    ? 'Vos achats ont été vérifiés. Votre accès est actualisé.'
    : 'Aucun achat correspondant à ce compte n’a été trouvé dans cette boutique.';
}

/** Native catalog and receipts are never used to grant local Pro entitlements. */
export function NativeBillingPanel() {
  const context = useApp();
  const { store, openAccount, notify } = context;
  const current = useRef(context);
  useEffect(() => {
    current.current = context;
  }, [context]);
  const accountId = store.user?.id ?? '';
  const workspaceId = store.workspaceId;
  const scopeKey = `${accountId}:${workspaceId}`;
  const eligible = Boolean(
    accountId &&
    store.isCloud &&
    store.currentWorkspace?.kind === 'personal' &&
    store.currentWorkspace.role === 'owner',
  );
  const [loaded, setLoaded] = useState<{
    scope: string;
    value: NativePurchasePreparation;
    receivedAt: number;
  } | null>(null);
  const [status, setStatus] = useState<{
    scope: string;
    message: string;
    requiresRestore: boolean;
  } | null>(null);
  const [working, setWorking] = useState<{ scope: string; action: string } | null>(null);
  const version = useRef(0);
  const preparation = loaded?.scope === scopeKey ? loaded.value : null;
  const feedback = status?.scope === scopeKey ? status : null;
  const busy = working?.scope === scopeKey;
  const platform = nativeStorePlatform();

  const scope = useCallback(
    (): NativePurchaseScope => ({
      workspaceId,
      isCurrent: () => {
        const active = current.current.store;
        return (
          active.user?.id === accountId &&
          active.workspaceId === workspaceId &&
          active.currentWorkspace?.kind === 'personal' &&
          active.currentWorkspace.role === 'owner'
        );
      },
    }),
    [accountId, workspaceId],
  );

  const load = useCallback(async () => {
    if (!eligible || !platform) return;
    const revision = ++version.current;
    setWorking({ scope: scopeKey, action: 'Vérification de la boutique…' });
    try {
      const value = await nativePurchases.prepare(scope());
      if (revision !== version.current || !scope().isCurrent()) return;
      // GET also refreshes previously verified subscriptions and expiry on the server.
      await current.current.store.refreshAccount();
      if (revision !== version.current || !scope().isCurrent()) return;
      setLoaded({ scope: scopeKey, value, receivedAt: Date.now() });
      setStatus({
        scope: scopeKey,
        message:
          value.recovery.pending || value.recovery.unfinished
            ? recoveryMessage(value.recovery)
            : '',
        requiresRestore:
          value.recovery.pending || value.recovery.unfinished || value.configuration.refreshPending,
      });
    } catch (error) {
      if (revision !== version.current) return;
      setLoaded(null);
      setStatus({
        scope: scopeKey,
        message: nativePurchaseError(error).message,
        requiresRestore: false,
      });
    } finally {
      if (revision === version.current) setWorking(null);
    }
  }, [eligible, platform, scope, scopeKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    const accepted = () => {
      void load();
    };
    window.addEventListener('solace:legal-accepted', accepted);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('solace:legal-accepted', accepted);
      version.current += 1;
    };
  }, [load]);

  async function transact(action: 'purchase' | 'restore') {
    if (!eligible || busy || !preparation?.configuration.ready) return;
    if (
      action === 'purchase' &&
      (!preparation.offer || feedback?.requiresRestore || store.entitlements?.tier !== 'free')
    )
      return;
    const revision = ++version.current;
    const operationScope = scope();
    setWorking({
      scope: scopeKey,
      action: action === 'purchase' ? 'Confirmation dans la boutique…' : 'Restauration des achats…',
    });
    setStatus(null);
    try {
      const result =
        action === 'purchase'
          ? await nativePurchases.purchase(operationScope, preparation.offer!)
          : await nativePurchases.restore(operationScope);
      if (revision !== version.current || !operationScope.isCurrent()) return;
      await current.current.store.refreshAccount();
      if (revision !== version.current || !operationScope.isCurrent()) return;
      setStatus({
        scope: scopeKey,
        message: recoveryMessage(result),
        requiresRestore: result.pending || result.unfinished,
      });
    } catch (error) {
      if (revision !== version.current || !operationScope.isCurrent()) return;
      const issue = nativePurchaseError(error);
      setStatus({
        scope: scopeKey,
        message: issue.message,
        requiresRestore: [
          'pending',
          'verification',
          'account-changed',
          'purchase-blocked',
          'intent-expired',
        ].includes(issue.issue),
      });
    } finally {
      if (revision === version.current) setWorking(null);
    }
  }

  const tier = store.entitlements?.tier;
  const active = store.isCloud
    ? tier === 'pro'
      ? 'Pro'
      : tier === 'team'
        ? 'Team'
        : tier === 'free'
          ? 'Gratuit'
          : 'Vérification de votre accès…'
    : 'Espace local';
  const canPurchase = Boolean(
    eligible &&
    preparation?.configuration.ready &&
    preparation.offer &&
    !preparation.configuration.refreshPending &&
    preparation.configuration.purchaseAllowed &&
    tier === 'free' &&
    !feedback?.requiresRestore,
  );

  return (
    <>
      <Panel title="Votre offre" subtitle={store.currentWorkspace?.name}>
        <span className="badge">{active}</span>
        {!store.user ? (
          <>
            <p>
              Connectez-vous à Solace pour associer un achat à votre espace personnel. Votre espace
              local reste disponible sans abonnement.
            </p>
            <Button variant="secondary" onClick={openAccount}>
              Se connecter
            </Button>
          </>
        ) : !eligible ? (
          <p>
            Les achats Pro concernent uniquement votre espace personnel dont vous êtes propriétaire.
            Sélectionnez cet espace pour acheter ou restaurer un abonnement.
          </p>
        ) : !platform ? (
          <p className="notice">
            Les achats intégrés nécessitent l’application installée depuis l’App Store ou Google
            Play. Ils ne sont pas disponibles dans cet aperçu.
          </p>
        ) : preparation?.configuration.reason === 'legal_acceptance_required' ? (
          <>
            <p className="notice">
              Les conditions du compte doivent être vérifiées avant un achat.
            </p>
            <Button variant="secondary" onClick={openAccount}>
              Vérifier les conditions du compte
            </Button>
          </>
        ) : !preparation?.configuration.ready && !busy ? (
          <p className="notice">
            Les achats dans la boutique ne sont pas encore disponibles. Votre accès actuel reste
            vérifié par Solace.
          </p>
        ) : null}

        {eligible && preparation?.configuration.ready && (
          <>
            {preparation.configuration.reason === 'launch_review_required' && (
              <p className="notice">
                Les nouveaux abonnements ne sont pas encore ouverts. Vous pouvez restaurer et gérer
                vos achats existants.
              </p>
            )}
            {preparation.configuration.pendingPurchaseIntent && (
              <p className="notice">
                {Date.parse(preparation.configuration.pendingPurchaseIntent.expiresAt) <=
                (loaded?.receivedAt ?? 0)
                  ? 'Une tentative d’achat reste à vérifier malgré le dépassement de son délai initial. Un nouvel achat reste bloqué pour éviter une double facturation. Restaurez vos achats ou contactez l’assistance.'
                  : 'Une tentative d’achat attend sa confirmation. Ne rachetez pas l’abonnement ; restaurez vos achats après confirmation de la boutique.'}
              </p>
            )}
            {!preparation.configuration.purchaseAllowed &&
              !preparation.configuration.pendingPurchaseIntent &&
              preparation.configuration.reason !== 'launch_review_required' &&
              tier === 'free' && (
                <p className="notice">
                  Un abonnement ou une commande reste à vérifier pour ce compte. Vérifiez votre
                  abonnement existant ou contactez l’assistance avant un nouvel achat.
                </p>
              )}
            {preparation.configuration.refreshPending && (
              <p className="notice">
                La vérification de votre abonnement reste en attente. Actualisez votre accès ou
                restaurez vos achats avant de souscrire.
              </p>
            )}
            {preparation.offer && tier === 'free' && (
              <div className="panel">
                <h3>{preparation.offer.title}</h3>
                <p>{preparation.offer.description}</p>
                <p>
                  <strong>{preparation.offer.priceString} par mois</strong>
                </p>
                <p className="helper">
                  Abonnement mensuel avec renouvellement automatique, facturé par{' '}
                  {platform === 'ios' ? 'Apple' : 'Google Play'}. Le montant et la confirmation
                  définitive sont présentés par la boutique. Vous pouvez désactiver le
                  renouvellement dans ses réglages d’abonnement.
                </p>
                <Button disabled={!canPurchase || busy} onClick={() => void transact('purchase')}>
                  S’abonner à Pro
                </Button>
              </div>
            )}
            {!preparation.offer && tier === 'free' && !busy && (
              <p className="notice">
                Aucune offre mensuelle compatible n’a été fournie par la boutique. Aucun paiement ne
                sera lancé.
              </p>
            )}
            <p className="helper">
              <ShieldCheck size={15} aria-hidden="true" /> Votre accès est activé après vérification
              de l’achat par Solace. Restaurer un achat existant ne déclenche pas de nouvel achat.
            </p>
            <div className="page-actions">
              <Button variant="secondary" disabled={busy} onClick={() => void transact('restore')}>
                Restaurer mes achats
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setWorking({ scope: scopeKey, action: 'Ouverture de vos abonnements…' });
                  void nativePurchases
                    .manage()
                    .catch((error) => {
                      if (scope().isCurrent())
                        setStatus({
                          scope: scopeKey,
                          message: nativePurchaseError(error).message,
                          requiresRestore: false,
                        });
                    })
                    .finally(() => {
                      if (scope().isCurrent()) setWorking(null);
                    });
                }}
              >
                Gérer mon abonnement
              </Button>
            </div>
          </>
        )}
        {busy && <p role="status">{working.action}</p>}
        {feedback?.message && (
          <p className="notice" role="status">
            {feedback.message}
          </p>
        )}
        <div className="page-actions">
          <Button variant="secondary" onClick={() => context.navigate('settings')}>
            Personnaliser mon espace
          </Button>
          {eligible && (
            <Button variant="secondary" disabled={busy} onClick={() => void load()}>
              <RefreshCw size={15} /> Actualiser mon accès
            </Button>
          )}
        </div>
      </Panel>
      <nav className="helper centered" aria-label="Informations et abonnements">
        {legalLinks.map(([path, label]) => (
          <Button
            key={path}
            variant="ghost"
            onClick={() => {
              void openExternalUrl(new URL(path, appApiOrigin()).href).catch(() =>
                notify('Cette page n’a pas pu être ouverte.'),
              );
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
    </>
  );
}

/** Mount under AppContext: scope recovery to the user's owned personal workspace. */
export function NativeBillingRecovery() {
  const context = useApp();
  const current = useRef(context);
  useEffect(() => {
    current.current = context;
  }, [context]);
  const accountId = context.store.user?.id ?? '';
  const personalId =
    context.store.workspaces.find(
      (workspace) => workspace.kind === 'personal' && workspace.role === 'owner',
    )?.id ?? '';
  const ready = context.store.ready;
  useEffect(() => {
    if (!ready || !accountId || !personalId || !nativeStorePlatform()) return;
    let disposed = false;
    let running = false;
    let warned = false;
    let removeListener: (() => Promise<void>) | undefined;
    let observing = false;
    const scope: NativePurchaseScope = {
      workspaceId: personalId,
      isCurrent: () =>
        !disposed &&
        current.current.store.user?.id === accountId &&
        current.current.store.workspaces.some(
          (workspace) =>
            workspace.id === personalId &&
            workspace.kind === 'personal' &&
            workspace.role === 'owner',
        ),
    };
    const confirmed = async (result: NativePurchaseRecovery) => {
      if (!scope.isCurrent()) return;
      await current.current.store.refreshAccount();
      if (!scope.isCurrent()) return;
      if (result.unfinished && !warned) {
        warned = true;
        current.current.notify(
          'Un achat reste à vérifier. Ouvrez « Offres et facturation » puis « Restaurer mes achats ».',
        );
      }
      if (!result.unfinished) warned = false;
    };
    const resume = () => {
      if (running || !scope.isCurrent()) return;
      running = true;
      void nativePurchases
        .recover(scope)
        .then(confirmed)
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    };
    const observe = () => {
      if (observing || removeListener || !scope.isCurrent()) return;
      observing = true;
      void nativePurchases
        .observe(scope, (result) => {
          void confirmed(result).catch(() => undefined);
        })
        .then(async (listener) => {
          if (!listener) return;
          if (disposed) await listener.remove();
          else removeListener = () => listener.remove();
        })
        .catch(() => undefined)
        .finally(() => {
          observing = false;
        });
    };
    const accepted = () => {
      resume();
      observe();
    };
    const timer = setTimeout(() => {
      resume();
      observe();
    }, 0);
    window.addEventListener('focus', resume);
    window.addEventListener('solace:legal-accepted', accepted);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('solace:legal-accepted', accepted);
      void removeListener?.().catch(() => undefined);
    };
  }, [ready, accountId, personalId]);
  return null;
}
