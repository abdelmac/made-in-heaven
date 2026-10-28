import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getLaunchInformation, getPublisherInformation } from '@/lib/launch-config';
import styles from './launch-information.module.css';
import { PrivacyDetails } from './privacy-details';
import { TermsDetails } from './terms-details';
import { LegalDetails } from './legal-details';

type InformationPage = 'legal' | 'privacy' | 'terms' | 'support';

const pages = {
  legal: {
    title: 'Mentions légales',
    description: 'Identité de l’éditeur et du vendeur de Solace, coordonnées et mentions légales.',
    introduction:
      'Retrouvez les coordonnées publiées pour Solace et le lien vers les mentions légales.',
    documentTitle: 'Lire les mentions légales',
    missingDocument: 'Les mentions légales complètes ne sont pas encore publiées.',
  },
  privacy: {
    title: 'Confidentialité',
    description: 'Accès à la politique de confidentialité de Solace et au contact de support.',
    introduction:
      'Comprendre les données utilisées par Solace, leur synchronisation et vos possibilités de suppression.',
    documentTitle: 'Lire la politique de confidentialité',
    missingDocument: 'La politique de confidentialité n’est pas encore publiée.',
  },
  terms: {
    title: 'Conditions',
    description: 'Accès aux conditions d’utilisation et de vente publiées pour Solace.',
    introduction: 'Consultez les conditions publiées avant de souscrire à une offre Solace.',
    documentTitle: 'Lire les conditions d’utilisation et de vente',
    missingDocument: 'Les conditions d’utilisation et de vente ne sont pas encore publiées.',
  },
  support: {
    title: 'Aide et contact',
    description: 'Contacter le support Solace et retrouver les informations sur le service.',
    introduction:
      'Une question sur votre compte, une fonctionnalité ou un abonnement ? Retrouvez ici le contact du support.',
    documentTitle: '',
    missingDocument: '',
  },
} satisfies Record<
  InformationPage,
  {
    title: string;
    description: string;
    introduction: string;
    documentTitle: string;
    missingDocument: string;
  }
>;

export async function launchPageMetadata(page: InformationPage): Promise<Metadata> {
  await connection();
  const information = getLaunchInformation();
  const ready =
    information.ready &&
    (page !== 'privacy' || hasPublishedPrivacyPolicy(information.privacyPolicyUrl));
  return {
    title: `${pages[page].title} — Solace`,
    description: pages[page].description,
    robots: { index: ready, follow: ready },
  };
}

function hasPublishedPrivacyPolicy(url: string | null): boolean {
  if (!url) return false;
  const parsed = new URL(url);
  return !(
    parsed.pathname.replace(/\/$/, '') === '/privacy' &&
    ['www.solace-pomodoro.com', 'solace-pomodoro.com'].includes(parsed.hostname)
  );
}

export async function LaunchInformationPage({ page }: { page: InformationPage }) {
  await connection();
  const information = getLaunchInformation();
  const publisher = getPublisherInformation();
  const content = pages[page];
  const documentUrl = {
    legal: information.legalNoticeUrl,
    privacy: information.privacyPolicyUrl,
    terms: information.termsUrl,
    support: null,
  }[page];
  // A same-origin policy URL must not turn its own page into a circular link.
  const selfLinkedDocument = documentUrl
    ? new URL(documentUrl).pathname.replace(/\/$/, '') === `/${page}` &&
      ['www.solace-pomodoro.com', 'solace-pomodoro.com'].includes(new URL(documentUrl).hostname)
    : false;
  const pageReady =
    information.ready && (page !== 'privacy' || hasPublishedPrivacyPolicy(documentUrl));

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        {/* Native navigation lets the shared root entry read its final workspace URL. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/?view=overview"
          className={styles.brand}
          aria-label="Solace, retour à l’application"
        >
          Solace
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/?view=overview" className={styles.back}>
          Retour à l’application
        </a>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Informations et contact</p>
        <h1>{content.title}</h1>
        <p className={styles.introduction}>{content.introduction}</p>
        {(publisher.displayName || publisher.country) && (
          <p className={styles.secondary}>
            Éditeur public : {publisher.displayName ?? 'nom à renseigner'}
            {publisher.country && ` · ${publisher.country}`}
          </p>
        )}

        {!pageReady && (
          <aside className={styles.notice} aria-label="Informations en préparation">
            <strong>Informations en préparation</strong>
            <p>
              Certains éléments ne sont pas encore publiés. Cette page est provisoire et ne
              constitue pas un document contractuel complet.
            </p>
          </aside>
        )}

        {page !== 'support' && (
          <section className={styles.section} aria-labelledby="document-heading">
            <h2 id="document-heading">Document publié</h2>
            {documentUrl && !selfLinkedDocument ? (
              <>
                <a className={styles.documentLink} href={documentUrl} rel="noreferrer">
                  {content.documentTitle}
                </a>
                <p className={styles.secondary}>
                  Document externe publié par l’éditeur de Solace sur{' '}
                  {new URL(documentUrl).hostname}.
                </p>
              </>
            ) : ['privacy', 'terms', 'legal'].includes(page) ? (
              <p>Le document de Solace est présenté ci-dessous.</p>
            ) : (
              <p>
                {content.missingDocument} Le lien sera disponible ici lorsqu’il aura été renseigné.
              </p>
            )}
          </section>
        )}

        {page === 'privacy' && (!documentUrl || selfLinkedDocument) && (
          <PrivacyDetails information={information} publisher={publisher} />
        )}
        {page === 'terms' && (!documentUrl || selfLinkedDocument) && (
          <TermsDetails information={information} publisher={publisher} />
        )}

        {page === 'legal' && (!documentUrl || selfLinkedDocument) && (
          <LegalDetails information={information} publisher={publisher} />
        )}
        {page === 'legal' && documentUrl && !selfLinkedDocument && (
          <section className={styles.section} aria-label="Éditeur de Solace">
            <dl className={styles.details}>
              {[
                ['Éditeur', information.sellerName],
                ['Adresse', information.sellerAddress],
                ['Immatriculation', information.sellerRegistration],
              ].map(
                ([label, value]) =>
                  value && (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ),
              )}
            </dl>
          </section>
        )}

        <section className={styles.section} aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contacter Solace</h2>
          {information.supportEmail ? (
            <>
              <p>Vous pouvez écrire à l’adresse suivante :</p>
              <p className={styles.email}>{information.supportEmail}</p>
              {page === 'support' && (
                <p className={styles.secondary}>
                  Décrivez votre demande et, si nécessaire, le problème rencontré. N’envoyez pas
                  votre mot de passe ni vos coordonnées de carte bancaire.
                </p>
              )}
            </>
          ) : (
            <p>L’adresse de contact du support n’est pas encore publiée.</p>
          )}
        </section>

        <nav className={styles.navigation} aria-label="Informations sur Solace">
          {(Object.keys(pages) as InformationPage[]).map((entry) => (
            <Link key={entry} href={`/${entry}`} aria-current={entry === page ? 'page' : undefined}>
              {pages[entry].title}
            </Link>
          ))}
          <Link href="/account-deletion">Suppression du compte</Link>
        </nav>
      </main>
    </div>
  );
}
