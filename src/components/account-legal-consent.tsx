'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  accountSignupMetadata,
  isOnlineAccountAgeGroup,
  type AccountAgeGroup,
} from '@/lib/account-eligibility';
import { appFetch } from '@/lib/app-fetch';
import { localizeError } from '@/lib/i18n/errors';
import { useApp } from './app-context';
import { Button, Field } from './ui';

/** Existing sessions are not proof of legal acceptance or of a person's age. */
export function AccountLegalConsent() {
  const { store } = useApp();
  return store.user ? <LegalConsentForm key={store.user.id} accountId={store.user.id} /> : null;
}

function LegalConsentForm({ accountId }: { accountId: string }) {
  const { store, notify } = useApp();
  const activeAccount = useRef(store.user?.id);
  useEffect(() => {
    activeAccount.current = store.user?.id;
  }, [store.user?.id]);
  const mounted = useRef(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [ageGroup, setAgeGroup] = useState<AccountAgeGroup | ''>('');
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    let current = true;
    async function read() {
      try {
        const response = await appFetch('/api/account/consent', {
          cache: 'no-store',
          signal: abort.signal,
        });
        const body = await response.json();
        if (!response.ok || typeof body.eligible !== 'boolean')
          throw new Error(
            body.error || 'Impossible de vérifier les conditions de ce compte. Réessayez.',
          );
        if (current) setEligible(body.eligible);
      } catch (error) {
        if (current)
          setMessage(localizeError(error instanceof Error ? error.message : String(error)));
      }
    }
    void read();
    return () => {
      current = false;
      mounted.current = false;
      abort.abort();
    };
  }, [reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const declaration = accountSignupMetadata(ageGroup, legalAccepted);
    if (!declaration) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await appFetch('/api/account/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(declaration),
      });
      const body = await response.json();
      if (!response.ok || body.eligible !== true)
        throw new Error(body.error || 'Votre acceptation n’a pas pu être enregistrée. Réessayez.');
      if (!mounted.current || activeAccount.current !== accountId) return;
      setEligible(true);
      window.dispatchEvent(new Event('solace:legal-accepted'));
      notify('Votre déclaration et votre acceptation ont été enregistrées pour ce compte.');
    } catch (error) {
      if (mounted.current && activeAccount.current === accountId)
        setMessage(localizeError(error instanceof Error ? error.message : String(error)));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (eligible === true)
    return <p className="helper">Les conditions actuelles sont enregistrées pour ce compte.</p>;
  if (eligible === null)
    return (
      <div className="notice">
        {message ? (
          <>
            <p role="alert">{message}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMessage('');
                setReload((value) => value + 1);
              }}
            >
              Réessayer
            </Button>
          </>
        ) : (
          <p>Vérification des conditions de ce compte…</p>
        )}
      </div>
    );
  return (
    <section aria-label="Conditions du compte en ligne" className="notice">
      <h3>Conditions du compte en ligne</h3>
      <p>
        Avant d’activer les services du compte en ligne, choisissez votre tranche d’âge et consultez
        les conditions actuelles. Aucune date de naissance n’est demandée.
      </p>
      <form onSubmit={submit}>
        <Field label="Votre tranche d’âge pour ce compte">
          <select
            value={ageGroup}
            required
            disabled={busy}
            onChange={(event) => {
              setAgeGroup(event.target.value as AccountAgeGroup | '');
              setLegalAccepted(false);
              setMessage('');
            }}
          >
            <option value="">Choisir une tranche d’âge</option>
            <option value="under16">Moins de 16 ans</option>
            <option value="16-17">16–17 ans</option>
            <option value="18+">18 ans et plus</option>
          </select>
        </Field>
        {ageGroup === 'under16' && (
          <p>
            Les comptes en ligne sont réservés aux personnes de 16 ans et plus. Déconnectez-vous
            pour continuer avec les outils locaux sur cet appareil. Aucun achat ni acceptation ne
            sera envoyé ici.
          </p>
        )}
        {isOnlineAccountAgeGroup(ageGroup) && (
          <>
            <label className="row">
              <input
                type="checkbox"
                required
                checked={legalAccepted}
                disabled={busy}
                onChange={(event) => setLegalAccepted(event.target.checked)}
              />
              <span>
                J’accepte les{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer">
                  conditions d’utilisation
                </a>{' '}
                et j’ai pris connaissance de la{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  politique de confidentialité
                </a>
                .
              </span>
            </label>
            <Button type="submit" disabled={busy || !legalAccepted}>
              {busy ? 'Enregistrement…' : 'Enregistrer mon acceptation'}
            </Button>
          </>
        )}
        {message && <p role="alert">{message}</p>}
      </form>
    </section>
  );
}
