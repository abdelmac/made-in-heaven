import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getLaunchInformation, getPublisherInformation } from '@/lib/launch-config';
import styles from '@/components/launch-information.module.css';
import deletionStyles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const { ready } = getLaunchInformation();
  return {
    title: 'Supprimer votre compte — Solace',
    description:
      'Supprimez votre compte Solace et votre espace personnel depuis le Web, sans réinstaller l’application.',
    robots: { index: ready, follow: ready },
  };
}

export default async function AccountDeletionPage() {
  await connection();
  const information = getLaunchInformation();
  const publisher = getPublisherInformation();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        {/* Full navigation lets the workspace entry read its destination URL. */}
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
        <p className={styles.eyebrow}>Votre compte et vos données</p>
        <h1>Supprimer votre compte Solace</h1>
        <p className={styles.introduction}>
          Vous pouvez supprimer votre compte et les données de votre espace personnel depuis ce
          site, même si vous avez désinstallé l’application.
        </p>
        {(publisher.displayName || publisher.country) && (
          <p className={styles.secondary}>
            Éditeur public : {publisher.displayName ?? 'nom à renseigner'}
            {publisher.country && ` · ${publisher.country}`}
          </p>
        )}

        <section className={styles.section} aria-labelledby="start-deletion-heading">
          <h2 id="start-deletion-heading">Commencer la suppression</h2>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/?account=delete" className={deletionStyles.action}>
            Ouvrir la suppression du compte
          </a>
          <p className={styles.secondary}>
            Ce lien ouvre les paramètres du compte dans Solace pour le Web. Connectez-vous au compte
            concerné si nécessaire. Aucune installation n’est requise et ce lien ne supprime rien
            sans votre confirmation.
          </p>
          <ol className={deletionStyles.steps}>
            <li>
              Dans <strong>Paramètres → Compte</strong>, choisissez{' '}
              <strong>Supprimer le compte</strong>.
            </li>
            <li>
              Lisez les conséquences, renseignez votre mot de passe actuel et saisissez{' '}
              <code>DELETE</code>, puis confirmez avec <strong>Supprimer le compte</strong>.
            </li>
            <li>
              Attendez le message <strong>Votre compte a été supprimé.</strong> Si une erreur
              apparaît, suivez les indications avant de réessayer.
            </li>
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="before-deletion-heading">
          <h2 id="before-deletion-heading">Avant de confirmer</h2>
          <ul className={deletionStyles.steps}>
            <li>
              Exportez les données que vous souhaitez conserver dans{' '}
              <strong>Paramètres → Vos données</strong>. La suppression du compte est définitive.
            </li>
            <li>
              Si vous possédez une organisation, transférez-en la propriété depuis{' '}
              <strong>Organisation</strong> avant de supprimer votre compte.
            </li>
            <li>
              Les abonnements Web de votre espace personnel sont résiliés lors de la suppression.
              Vérifiez vos informations dans <strong>Offres et facturation</strong>. Une erreur de
              facturation peut empêcher la suppression de se terminer.
            </li>
            <li>
              Un abonnement Apple ou Google n’est pas résilié automatiquement par la suppression du
              compte Solace. Arrêtez ses renouvellements dans les réglages de la boutique :{' '}
              <a href="https://apps.apple.com/account/subscriptions">Apple</a> ou{' '}
              <a href="https://play.google.com/store/account/subscriptions">Google Play</a>. Vous
              pouvez supprimer votre compte immédiatement, même si cet abonnement reste actif.
            </li>
            <li>
              Votre mot de passe actuel est demandé pour vérifier à nouveau votre identité. La
              suppression nécessite une connexion datant de moins de dix minutes.
            </li>
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="deleted-data-heading">
          <h2 id="deleted-data-heading">Données supprimées</h2>
          <p>
            La suppression retire votre compte de connexion, votre profil, votre espace personnel et
            les données qui y sont synchronisées : matières, projets, tâches, planning, séances de
            concentration, notes, cartes mémoire et historique. Vos préférences liées au compte, vos
            appartenances aux espaces et vos minuteurs actifs sont également retirés.
          </p>
          <p>
            Après la confirmation du serveur, Solace efface les données mises en cache pour ce
            compte sur l’appareil utilisé. Si le nettoyage local ne peut pas être terminé, un
            message vous indique d’effacer les données locales de cet appareil.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="retained-data-heading">
          <h2 id="retained-data-heading">Données qui peuvent rester</h2>
          <ul className={deletionStyles.steps}>
            <li>
              Les ressources collectives d’une organisation, comme ses matières, projets et tâches,
              restent dans cet espace. Vos notes, journaux, cartes de révision, séances et
              événements attribués à votre compte sont retirés ; les affectations à votre compte
              sont effacées. Les contenus d’autres membres sont conservés.
            </li>
            <li>
              Les factures et les données de paiement déjà enregistrées chez Stripe, Apple ou Google
              ne sont pas automatiquement supprimées par cette action. Les sauvegardes et journaux
              techniques des prestataires suivent leurs modalités de conservation.
            </li>
            <li>
              Les fichiers que vous avez exportés, les copies sur d’autres appareils et les données
              utilisées sans compte doivent être effacés séparément sur les appareils concernés.
            </li>
          </ul>
          <p>
            Consultez la <Link href="/privacy">politique de confidentialité</Link> pour les
            informations de conservation publiées pour Solace.
          </p>
          {!information.ready && (
            <p className={styles.notice}>
              Les informations de confidentialité et les durées de conservation ne sont pas encore
              toutes publiées. Cette page ne fixe pas de délai de suppression pour les sauvegardes,
              les journaux des prestataires ou les pièces de facturation.
            </p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="deletion-support-heading">
          <h2 id="deletion-support-heading">Une difficulté pour supprimer votre compte ?</h2>
          {information.supportEmail ? (
            <>
              <p>
                Pour une difficulté de connexion ou de suppression, écrivez à{' '}
                <a
                  className={styles.documentLink}
                  href={`mailto:${information.supportEmail}?subject=${encodeURIComponent('Suppression de mon compte Solace')}`}
                >
                  {information.supportEmail}
                </a>
                .
              </p>
              <p className={styles.secondary}>
                Indiquez l’adresse e-mail du compte concerné et le problème rencontré. N’envoyez
                jamais votre mot de passe ni vos coordonnées de carte bancaire.
              </p>
            </>
          ) : (
            <p>L’adresse de contact du support n’est pas encore publiée.</p>
          )}
        </section>

        <nav className={styles.navigation} aria-label="Informations sur Solace">
          <Link href="/legal">Mentions légales</Link>
          <Link href="/privacy">Confidentialité</Link>
          <Link href="/terms">Conditions</Link>
          <Link href="/support">Aide et contact</Link>
          <Link href="/account-deletion" aria-current="page">
            Supprimer le compte
          </Link>
        </nav>
      </main>
    </div>
  );
}
