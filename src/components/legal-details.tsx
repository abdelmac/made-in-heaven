import Link from 'next/link';
import type { LaunchInformation, PublisherInformation } from '@/lib/launch-config';
import styles from './launch-information.module.css';

export function LegalDetails({
  information,
  publisher,
}: {
  information: LaunchInformation;
  publisher: PublisherInformation;
}) {
  return (
    <article aria-label="Éditeur et informations légales de Solace">
      <section className={styles.section}>
        <h2>Éditeur de Solace</h2>
        <dl className={styles.details}>
          <div>
            <dt>Nom légal ou raison sociale</dt>
            <dd>{information.sellerName ?? 'Non renseigné'}</dd>
          </div>
          <div>
            <dt>Nom public</dt>
            <dd>{publisher.displayName ?? 'Non renseigné'}</dd>
          </div>
          <div>
            <dt>Pays déclaré</dt>
            <dd>{publisher.country ?? 'Non renseigné'}</dd>
          </div>
          <div>
            <dt>Adresse de l’éditeur</dt>
            <dd>{information.sellerAddress ?? 'Non renseignée'}</dd>
          </div>
          <div>
            <dt>Immatriculation</dt>
            <dd>
              {information.sellerRegistration ??
                'Non renseignée ; à préciser si le statut ou l’activité y est assujetti.'}
            </dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>
              {information.supportEmail ? (
                <a href={`mailto:${information.supportEmail}`}>{information.supportEmail}</a>
              ) : (
                'Adresse e-mail non renseignée'
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <h2>Informations de publication à préciser</h2>
        <p>
          Le statut d’exploitation, la direction de publication et les coordonnées téléphoniques de
          l’éditeur restent à confirmer. Selon le statut et l’activité, les mentions
          professionnelles applicables, notamment une forme juridique, une adresse de domiciliation,
          une immatriculation et un numéro de TVA lorsqu’il est requis, doivent compléter cette
          page.
        </p>
        <p>
          Un nom public ou un accès gratuit ne dispense pas à lui seul des obligations
          d’identification. L’éventuel régime applicable à un éditeur non professionnel suppose des
          conditions particulières, dont la communication de son identité à l’hébergeur ; il n’est
          pas présumé ici. Les règles de publication sont exposées dans l’{' '}
          <a
            href="https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000049568614"
            rel="noreferrer"
          >
            article 1-1 de la loi pour la confiance dans l’économie numérique
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2>Hébergement du site et des API</h2>
        <p>
          Vercel Inc.
          <br />
          440 N Barranca Avenue #4133
          <br />
          Covina, CA 91723
          <br />
          États-Unis
        </p>
        <p>
          Adresse publiée dans la{' '}
          <a href="https://vercel.com/legal/privacy-notice" rel="noreferrer">
            notice officielle de Vercel
          </a>
          , vérifiée le 28 octobre 2026. Pour contacter l’hébergeur, consultez son{' '}
          <a href="https://vercel.com/help" rel="noreferrer">
            centre d’assistance
          </a>
          . Le numéro de téléphone général de l’hébergeur reste à confirmer.
        </p>
        <p>
          Cette adresse est celle du prestataire ; elle ne précise pas la région de stockage de vos
          données. Les autres services intervenant dans les comptes, les e-mails et les éventuels
          paiements sont décrits dans la <Link href="/privacy">politique de confidentialité</Link>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Contenus, droits et signalements</h2>
        <p>
          Les éléments de Solace et les contenus de ses utilisateurs sont protégés selon les droits
          applicables à chacun. L’utilisation du service ne transfère pas leur propriété. Les règles
          d’usage, d’export et de suppression figurent dans les{' '}
          <Link href="/terms">conditions d’utilisation</Link>.
        </p>
        <p>
          Pour signaler une erreur ou un contenu que vous estimez illicite, utilisez le{' '}
          <Link href="/support">contact du support</Link> en précisant le contenu concerné et le
          motif de votre demande. Pour votre compte et vos données, consultez la{' '}
          <Link href="/account-deletion">page de suppression</Link> et la politique de
          confidentialité.
        </p>
      </section>
    </article>
  );
}
