import Link from 'next/link';
import type { LaunchInformation, PublisherInformation } from '@/lib/launch-config';
import styles from './launch-information.module.css';

export function TermsDetails({
  information,
  publisher,
}: {
  information: LaunchInformation;
  publisher: PublisherInformation;
}) {
  return (
    <article aria-label="Conditions d’utilisation de Solace">
      <section className={styles.section}>
        <h2>Le service et son éditeur</h2>
        <p className={styles.secondary}>Version préparée le 28 octobre 2026.</p>
        <p>
          Solace est un outil de concentration et d’organisation : minuteur, tâches, projets,
          planning, notes, cartes mémoire et suivi personnel. Son éditeur est{' '}
          {information.sellerName ?? 'à renseigner'}
          {publisher.displayName && `, sous le nom public ${publisher.displayName}`}.
          {publisher.country && ` Pays déclaré : ${publisher.country}.`} Les coordonnées et les
          informations de publication disponibles figurent dans les{' '}
          <Link href="/legal">mentions légales</Link>.
        </p>
        <p>
          Ces conditions décrivent l’utilisation de Solace et de ses espaces gratuits. Les
          fonctionnalités accessibles dépendent de votre version et, pour les espaces connectés, des
          droits associés au compte.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Public et accès aux comptes</h2>
        <p>
          Les outils locaux sont accessibles aux personnes de tout âge. Pour cette version, les
          comptes en ligne et les achats Pro sont réservés aux personnes déclarant avoir au moins 16
          ans. Une personne plus jeune peut continuer à utiliser les outils locaux ; aucun mécanisme
          de consentement parental vérifié n’est proposé pour un compte enfant. Une classification
          d’âge attribuée par une boutique décrit le contenu et ne modifie pas ces conditions
          d’accès au compte.
        </p>
        <p>
          Si vous êtes mineur, obtenez l’accord de votre représentant légal lorsque la loi le
          requiert, notamment pour souscrire un abonnement. Les autorisations et contrôles parentaux
          de votre appareil ou de la boutique restent applicables.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Espace local, compte et sécurité</h2>
        <p>
          Vous pouvez utiliser un espace local sans compte. Ses données restent sur votre appareil.
          L’effacement du stockage du navigateur ou de l’application peut les faire disparaître :
          conservez une exportation des informations importantes.
        </p>
        <p>
          Un compte permet d’accéder à la synchronisation et aux espaces partagés. Utilisez une
          adresse e-mail que vous contrôlez et protégez votre mot de passe. Les données de votre
          espace local ne sont pas importées automatiquement dans votre compte. Vérifiez le résultat
          d’une synchronisation, notamment après une période hors ligne.
        </p>
        <p>
          Signalez au support une utilisation non autorisée de votre compte. La{' '}
          <Link href="/privacy">politique de confidentialité</Link> explique les traitements de
          données ; ces conditions ne remplacent pas les consentements distincts qui seraient
          nécessaires.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Vos contenus et les espaces partagés</h2>
        <p>
          Vous conservez les droits sur vos contenus. Pour fournir les fonctions que vous
          choisissez, Solace doit pouvoir les enregistrer, les synchroniser et les afficher aux
          personnes autorisées dans l’espace concerné. Vous devez disposer des droits nécessaires
          sur les textes, images et autres contenus que vous importez ou partagez.
        </p>
        <p>
          Dans une organisation, les contenus partagés sont accessibles aux autres membres, y
          compris aux lecteurs. Les personnes disposant des droits appropriés peuvent les modifier
          ou les supprimer. Utilisez votre espace personnel pour les informations que vous ne
          souhaitez pas partager. Les préférences privées et le suivi d’humeur ne sont pas présentés
          aux autres membres de l’organisation.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Utilisation respectueuse et propriété intellectuelle</h2>
        <p>
          N’utilisez pas Solace pour diffuser des contenus illicites, porter atteinte aux droits
          d’autrui, harceler une personne, accéder sans autorisation à un espace ou perturber le
          service. Respectez les mesures de sécurité et les limites applicables à votre compte. Une
          restriction destinée à traiter un abus doit rester nécessaire et proportionnée ; vous
          pouvez contacter le support pour demander une explication ou un réexamen.
        </p>
        <p>
          Le code, l’interface, les signes distinctifs et les médias de Solace restent soumis aux
          droits de leurs titulaires respectifs. L’accès au service vous permet d’utiliser ses
          fonctions, sans transférer ces droits. Les composants tiers conservent leurs licences
          propres, et les exceptions prévues par la loi restent applicables.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Suivi personnel et notifications</h2>
        <p>
          Les scores et notes d’humeur ou d’énergie sont facultatifs. Ils servent à votre suivi
          personnel. Solace ne fournit ni diagnostic, ni traitement, ni conseil médical et ne
          remplace pas un professionnel de santé.
        </p>
        <p>
          Les rappels du minuteur dépendent des autorisations et du fonctionnement de votre
          appareil. Le système peut les retarder ou les empêcher. N’utilisez pas ces rappels pour
          une échéance dont dépend la sécurité d’une personne.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Exporter, quitter un espace et supprimer le compte</h2>
        <p>
          L’export de votre espace est disponible dans <strong>Paramètres → Vos données</strong>.
          Vous pouvez arrêter d’utiliser Solace et demander la suppression de votre compte dans{' '}
          <strong>Paramètres → Compte → Supprimer le compte</strong>, ou commencer depuis la{' '}
          <Link href="/account-deletion">page de suppression du compte</Link> sans réinstaller
          l’application.
        </p>
        <p>
          La suppression demande une vérification d’identité et une confirmation explicite.
          Transférez d’abord la propriété de vos organisations. La suppression retire votre compte,
          votre espace personnel et les contributions partagées attribuables à votre compte. Les
          ressources communes sans attribution individuelle et les contenus des autres membres
          restent dans leur organisation. Les fichiers déjà exportés ou copiés sur un autre appareil
          doivent être effacés séparément. Consultez la page de suppression et la politique de
          confidentialité pour les limites de conservation.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Offres payantes et droits du consommateur</h2>
        <p>
          Lorsqu’un abonnement Pro est disponible dans l’application, l’achat utilise la boutique
          Apple ou Google de votre appareil. Le prix local, les taxes applicables, la période et le
          renouvellement sont affichés par cette boutique avant votre confirmation. Toute offre
          payante proposée dans l’application ou sur le Web doit préciser avant la commande son prix
          total, ses fonctionnalités, sa durée, son renouvellement et ses modalités de résiliation.
          Ces conditions ne fixent aucun tarif.
        </p>
        <p>
          Les abonnements mensuels se renouvellent selon les conditions affichées par la boutique.
          Gérez leur renouvellement dans les réglages d’abonnement Apple ou Google. Restaurer les
          achats permet de demander la vérification des achats associés à votre compte, sans lancer
          un nouvel achat. La suppression du compte Solace ne résilie pas automatiquement un
          abonnement Apple ou Google : résiliez-le également dans la boutique pour arrêter les
          prochains renouvellements. Vous pouvez néanmoins demander la suppression immédiate de
          votre compte Solace.
        </p>
        <p>
          Pour un abonnement Web existant, consultez <strong>Offres et facturation</strong> pour sa
          gestion. La suppression du compte résilie immédiatement l’abonnement personnel géré par
          Solace et met fin à l’accès correspondant. Elle ne déclenche pas de remboursement
          automatique et ne vous prive pas d’un remboursement auquel la loi ou votre contrat vous
          donne droit.
        </p>
        <p>
          Les droits de rétractation, les garanties légales et les recours applicables sont
          préservés. Aucune renonciation générale au droit de rétractation n’est recueillie par ces
          conditions. Une éventuelle exception doit respecter les conditions légales et faire
          l’objet de l’information et des accords distincts nécessaires. Pour un futur achat réalisé
          par une boutique, les modalités de cette boutique doivent également être indiquées avant
          l’achat, sans réduire vos droits impératifs.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Disponibilité, évolution et responsabilités</h2>
        <p>
          Des opérations de maintenance, une panne ou une difficulté réseau peuvent interrompre
          certaines fonctions, notamment la synchronisation. Les possibilités hors ligne ne
          remplacent pas une sauvegarde. Les changements importants affectant vos conditions
          d’utilisation doivent vous être communiqués conformément aux règles applicables ; ils ne
          suppriment pas vos droits déjà acquis.
        </p>
        <p>
          Chacun reste responsable de ses actes dans les conditions prévues par la loi. Aucune
          clause de cette page n’exclut une responsabilité, une garantie ou un recours qui ne
          pourrait pas être écarté légalement, y compris lorsque le service est gratuit.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Contact et règlement des difficultés</h2>
        <p>
          Pour une question, un incident ou une réclamation,{' '}
          {information.supportEmail ? (
            <>
              écrivez à{' '}
              <a href={`mailto:${information.supportEmail}`}>{information.supportEmail}</a>
            </>
          ) : (
            <>
              le contact du support reste à publier sur la <Link href="/support">page d’aide</Link>
            </>
          )}
          . Ne communiquez pas votre mot de passe.
        </p>
        <p>
          La recherche d’une solution amiable ne conditionne pas l’exercice de vos recours. Les
          règles impératives et les juridictions compétentes sont déterminées par la loi ; cette
          page ne vous impose ni arbitrage obligatoire ni tribunal exclusif à l’étranger. Si une
          offre professionnelle destinée aux consommateurs est ouverte, les coordonnées du médiateur
          compétent doivent être communiquées avant la vente.
        </p>
      </section>
    </article>
  );
}
