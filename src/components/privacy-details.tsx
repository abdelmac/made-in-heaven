import Link from 'next/link';
import type { LaunchInformation, PublisherInformation } from '@/lib/launch-config';
import styles from './launch-information.module.css';

/** Product facts for the operator's policy review; no invented legal identity or retention. */
export function PrivacyDetails({
  information,
  publisher,
}: {
  information: LaunchInformation;
  publisher: PublisherInformation;
}) {
  return (
    <article aria-label="Données et fonctionnement de Solace">
      <section className={styles.section}>
        <h2>Qui traite vos données ?</h2>
        {(publisher.displayName || publisher.country) && (
          <p>
            Nom public : {publisher.displayName ?? 'à renseigner'}.
            {publisher.country && ` Pays déclaré : ${publisher.country}.`}
          </p>
        )}
        <p>
          Identité juridique de l’éditeur :{' '}
          {information.sellerName ?? 'à renseigner avant publication'}. Pour toute demande relative
          aux données :{' '}
          {information.supportEmail ?? 'adresse de contact à renseigner avant publication'}.
        </p>
        <p className={styles.secondary}>
          Ce document décrit le fonctionnement de Solace. Les bases légales applicables, les durées
          de conservation et les garanties de transfert doivent être complétées et validées avant la
          publication sur les boutiques.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Utilisation locale et compte facultatif</h2>
        <p>
          Le minuteur et l’espace local peuvent être utilisés sans compte. Les données de cet espace
          restent dans le stockage du navigateur ou de l’application. Créer un compte permet de
          synchroniser un espace personnel avec le service cloud. Les données d’un espace local ne
          sont pas envoyées automatiquement dans un compte : leur importation demande une action de
          votre part.
        </p>
        <p>
          Les outils locaux sont accessibles à tout âge. Cette version réserve les comptes en ligne
          et les achats Pro aux personnes déclarant avoir au moins 16 ans. La tranche d’âge, les
          versions des conditions et de cette politique acceptées ainsi que la date d’acceptation
          sont enregistrées pour le compte ; aucune date de naissance n’est demandée. Solace ne
          propose pas de consentement parental vérifié pour un compte enfant.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Données utilisées et finalités</h2>
        <dl className={styles.details}>
          <div>
            <dt>Compte et connexion</dt>
            <dd>
              Adresse e-mail, nom affiché facultatif, identifiant du compte et données de session,
              pour vous authentifier, sécuriser l’accès et envoyer les liens de confirmation ou de
              récupération du compte.
            </dd>
          </div>
          <div>
            <dt>Organisation et concentration</dt>
            <dd>
              Matières, projets, tâches, calendrier interne, séances de concentration, notes,
              journaux, fiches et cartes de révision, y compris leur historique, pour fournir les
              fonctionnalités que vous utilisez et synchroniser votre travail.
            </dd>
          </div>
          <div>
            <dt>Humeur et énergie</dt>
            <dd>
              Évaluations et notes facultatives saisies dans le suivi d’humeur. Elles font partie de
              vos préférences privées et ne sont pas affichées aux autres membres d’un espace
              partagé.
            </dd>
          </div>
          <div>
            <dt>Préférences et personnalisation</dt>
            <dd>
              Fuseau horaire, réglages du minuteur, couleurs, disposition et image de fond choisie,
              pour adapter votre expérience. Le choix d’une image de fond traite cette image pour
              l’enregistrer dans vos préférences.
            </dd>
          </div>
          <div>
            <dt>Abonnements web</dt>
            <dd>
              Identifiants client et abonnement, état des droits et informations de facturation
              utiles au service. Lorsque le paiement web est disponible, Stripe traite les
              coordonnées de paiement dans son interface ; Solace ne reçoit pas votre numéro de
              carte complet.
            </dd>
          </div>
          <div>
            <dt>Abonnements Apple et Google</dt>
            <dd>
              La boutique gère le paiement. Solace vérifie les transactions signées ou jetons
              d’achat auprès d’Apple ou de Google, et conserve les identifiants, l’état, la période
              et la plateforme de l’abonnement pour attribuer ou restaurer les droits et prévenir
              les réutilisations frauduleuses. Un identifiant opaque relie l’achat au compte. Solace
              ne reçoit pas votre numéro de carte complet.
            </dd>
          </div>
          <div>
            <dt>Fonctionnement et sécurité</dt>
            <dd>
              Les hébergeurs et services de connexion peuvent traiter des données techniques de
              requête, notamment l’adresse IP et les journaux de sécurité, pour fournir le service,
              détecter les erreurs et limiter les abus.
            </dd>
          </div>
        </dl>
      </section>
      <section className={styles.section}>
        <h2>Informations nécessaires et facultatives</h2>
        <p>
          L’adresse e-mail, un mot de passe, la déclaration d’une tranche d’âge autorisée et
          l’acceptation des conditions sont nécessaires pour créer un compte et utiliser sa
          synchronisation. Sans compte, vous pouvez utiliser le minuteur et l’espace local. Le nom
          affiché, le suivi d’humeur, les notes, l’image de fond et les notifications sont
          facultatifs. Vous pouvez utiliser les autres fonctionnalités sans renseigner une humeur ni
          choisir une image personnelle.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Espaces partagés</h2>
        <p>
          Les membres d’une organisation, y compris les lecteurs, peuvent consulter les contenus de
          son espace partagé. Utilisez votre espace personnel pour les contenus que vous ne
          souhaitez pas partager. Vos préférences privées, votre suivi d’humeur et l’état de votre
          minuteur sont conservés séparément des contenus partagés.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Services nécessaires au fonctionnement</h2>
        <p>
          Solace utilise Vercel pour son site et ses API, Supabase pour les comptes, les données
          synchronisées et le stockage audio, et Resend pour les e-mails de connexion. Stripe
          intervient pour les abonnements web lorsqu’ils sont disponibles. Ces services peuvent
          traiter les données nécessaires à leur fonction. Apple et Google traitent les achats
          natifs et leurs vérifications. Le support reçoit les messages que vous choisissez
          d’envoyer à son adresse Gmail ; n’y joignez pas de mot de passe ni de coordonnées
          bancaires.
        </p>
        <p>
          La base de données Supabase est située dans la région Paris. Cela ne signifie pas que tous
          les traitements des prestataires restent en France. Resend indique un stockage aux
          États-Unis, y compris avec une région d’envoi européenne. Vercel et les boutiques peuvent
          également traiter des informations dans d’autres pays. Les garanties applicables aux
          transferts et les contrats effectivement retenus doivent être validés par l’éditeur avant
          la publication commerciale.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Autorisations et stockage sur votre appareil</h2>
        <p>
          Les notifications sont facultatives et servent aux rappels du minuteur. Vous pouvez
          modifier leur autorisation dans les réglages de l’appareil. Les fonctions d’export et de
          partage créent les fichiers que vous demandez. Le calendrier de Solace est un calendrier
          interne ; l’export ICS ne donne pas accès à votre calendrier système.
        </p>
        <p>
          Le navigateur conserve les données locales, caches et informations de session utiles.
          L’application mobile utilise un stockage privé et le stockage sécurisé du système pour sa
          session. Les caches liés au compte sont effacés sur cet appareil lors d’une déconnexion ou
          d’une suppression réussie. Un fichier déjà exporté reste sous votre contrôle à
          l’emplacement où vous l’avez enregistré.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Accès, export et suppression</h2>
        <p>
          Vous pouvez modifier vos informations et exporter votre espace depuis les paramètres. La{' '}
          <Link href="/account-deletion">page de suppression du compte</Link> permet de démarrer la
          suppression dans un navigateur, même sans l’application installée. Une vérification
          d’identité et une confirmation explicite sont demandées. La suppression du compte entraîne
          la suppression de son espace personnel et de ses données de compte.
        </p>
        <p>
          Dans les espaces partagés, les notes, journaux, cartes de révision, séances et événements
          attribués à votre compte sont retirés. Les ressources collectives non attribuées à un
          auteur, comme les matières, projets et tâches, et les contenus des autres membres restent
          dans leur organisation. Les éventuelles obligations de conservation des justificatifs de
          paiement et les délais d’expiration des sauvegardes et des journaux doivent être précisés
          dans la version finale. Les copies déjà exportées ou détenues par un autre membre ne
          peuvent pas être retirées à distance de son appareil.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Conservation dans cette version</h2>
        <p>
          Les données locales restent sur votre appareil jusqu’à leur effacement. Les données du
          compte et l’historique d’acceptation des conditions restent tant que le compte existe ;
          cette version n’applique pas d’effacement automatique des comptes inactifs. Vous pouvez
          effacer vos contenus ou supprimer votre compte depuis les paramètres.
        </p>
        <p>
          Après suppression du compte, les justificatifs bruts d’achat natif et leur lien direct
          avec votre compte sont retirés. Des empreintes techniques d’achats et identifiants opaques
          peuvent subsister pour empêcher qu’un achat déjà utilisé soit transféré frauduleusement à
          un autre compte. Ces données ne sont pas présentées comme anonymes. Leur durée de
          conservation et celle des pièces comptables doivent être arrêtées avant la publication
          commerciale ; aucun effacement automatique de ces empreintes n’est actuellement prévu.
        </p>
        <p>
          Les sauvegardes et journaux des prestataires ont leurs propres cycles d’expiration et ne
          sont pas tous effacés immédiatement avec le compte actif. La politique définitive doit
          préciser les durées correspondant aux contrats et réglages réellement retenus.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Vos droits et vos demandes</h2>
        <p>
          Selon votre situation et les conditions prévues par la réglementation, vous pouvez
          demander l’accès à vos données, leur rectification ou leur effacement, la limitation du
          traitement, vous opposer à certains traitements et demander la portabilité de vos données.
          Lorsqu’un traitement repose sur votre consentement, vous pouvez retirer ce consentement.
        </p>
        <p>
          Pour une demande, écrivez à{' '}
          {information.supportEmail ?? 'l’adresse de contact qui sera publiée sur cette page'} en
          indiquant l’adresse du compte concerné et le droit que vous souhaitez exercer. Ne
          transmettez pas votre mot de passe. Si une vérification complémentaire est nécessaire,
          elle doit être adaptée à la demande.
        </p>
        <p>
          Vous pouvez également{' '}
          <a href="https://www.cnil.fr/fr/adresser-une-plainte" rel="noreferrer">
            adresser une réclamation à la CNIL
          </a>
          .
        </p>
      </section>
      <section className={styles.section}>
        <h2>Points à finaliser avant publication</h2>
        <p>
          L’éditeur doit confirmer le public et les pays visés, les bases légales, les durées de
          conservation par catégorie, les garanties de transfert et le contact permettant d’exercer
          vos droits. Cette page reste signalée comme provisoire tant que les informations de
          lancement ne sont pas complètes. Aucun délai légal ou engagement de conservation n’est
          supposé par défaut.
        </p>
      </section>
    </article>
  );
}
