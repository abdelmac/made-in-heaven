import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getLaunchInformation } from '@/lib/launch-config';
import styles from './launch-information.module.css';

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
      'Consultez la politique publiée pour connaître les informations relatives à vos données.',
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
  const { ready } = getLaunchInformation();
  return {
    title: `${pages[page].title} — Solace`,
    description: pages[page].description,
    robots: { index: ready, follow: ready },
  };
}

export async function LaunchInformationPage({ page }: { page: InformationPage }) {
  await connection();
  const information = getLaunchInformation();
  const content = pages[page];
  const documentUrl = {
    legal: information.legalNoticeUrl,
    privacy: information.privacyPolicyUrl,
    terms: information.termsUrl,
    support: null,
  }[page];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Solace, retour à l’application">
          Solace
        </Link>
        <Link href="/" className={styles.back}>
          Retour à l’application
        </Link>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Informations et contact</p>
        <h1>{content.title}</h1>
        <p className={styles.introduction}>{content.introduction}</p>

        {!information.ready && (
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
            {documentUrl ? (
              <>
                <a className={styles.documentLink} href={documentUrl} rel="noreferrer">
                  {content.documentTitle}
                </a>
                <p className={styles.secondary}>
                  Document externe publié par l’éditeur de Solace sur{' '}
                  {new URL(documentUrl).hostname}.
                </p>
              </>
            ) : (
              <p>
                {content.missingDocument} Le lien sera disponible ici lorsqu’il aura été renseigné.
              </p>
            )}
          </section>
        )}

        {page === 'legal' && (
          <section className={styles.section} aria-labelledby="seller-heading">
            <h2 id="seller-heading">Éditeur et vendeur</h2>
            <dl className={styles.details}>
              <div>
                <dt>Nom ou raison sociale</dt>
                <dd>{information.sellerName ?? 'Non renseigné'}</dd>
              </div>
              <div>
                <dt>Adresse</dt>
                <dd>{information.sellerAddress ?? 'Non renseignée'}</dd>
              </div>
              <div>
                <dt>Immatriculation</dt>
                <dd>{information.sellerRegistration ?? 'Non renseignée'}</dd>
              </div>
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
        </nav>
      </main>
    </div>
  );
}
