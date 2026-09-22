# Informations publiques avant ouverture

Les routes `/legal`, `/privacy`, `/terms` et `/support` publient les coordonnées et les liens fournis par le propriétaire de Solace. Aucun nom de vendeur, adresse, identifiant d’immatriculation, numéro de TVA ou texte contractuel n’est fourni par défaut.

Tant que les sept valeurs ci-dessous ne passent pas la validation, toutes ces pages affichent un avis provisoire et des métadonnées `noindex, nofollow`. Une valeur absente ou invalide n’est jamais publiée telle quelle. Les autres coordonnées valides restent visibles. Le remplissage des champs est une condition technique de lancement, pas une preuve d’identité, une vérification des documents ou une attestation de conformité.

## Valeurs à fournir

Ces variables sont lues côté serveur au moment de la requête. Leur contenu est destiné à être public. Ne pas y placer de clé, de mot de passe, de lien signé ni de donnée confidentielle.

| Variable                     | Contenu à renseigner                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SOLACE_SELLER_NAME`         | Nom réel ou raison sociale du vendeur et éditeur présenté sur le site.                                 |
| `SOLACE_SELLER_ADDRESS`      | Adresse de contact professionnelle complète destinée à être publiée, sur une seule ligne.              |
| `SOLACE_SELLER_REGISTRATION` | Immatriculation réelle et libellé permettant de l’identifier. Le code ne présume aucun pays ou statut. |
| `SOLACE_SUPPORT_EMAIL`       | Adresse électronique réelle, consultée par la personne chargée du support.                             |
| `SOLACE_LEGAL_NOTICE_URL`    | URL publique du texte complet des mentions légales.                                                    |
| `SOLACE_PRIVACY_POLICY_URL`  | URL publique de la politique de confidentialité.                                                       |
| `SOLACE_TERMS_URL`           | URL publique des conditions d’utilisation et de vente applicables.                                     |

Les URL de documents doivent être absolues en HTTPS, accessibles sans connexion, sans identifiants intégrés, port personnalisé, paramètres de requête ou fragment. Les adresses locales, les adresses IP, les domaines réservés aux exemples et les valeurs de remplacement manifestes sont refusés. Publier un lien stable vers chaque document ; ne pas utiliser une URL temporaire de partage contenant un jeton. Les contrôles ne téléchargent pas les documents et ne vérifient ni leur disponibilité, ni leur contenu, ni leurs éventuelles redirections.

## Préparer les documents

Le propriétaire doit fournir les textes correspondant à son activité et au fonctionnement réel du produit, puis en organiser la relecture adaptée à sa situation avant l’ouverture. Les pages de l’application servent de points d’accès à ces textes, elles n’en génèrent aucun. Faire figurer dans les documents les informations et modalités retenues par le propriétaire, notamment celles sur l’identité et le contact, l’utilisation du service, les données traitées et les offres vendues. Aucun régime juridique, délai de réponse du support ou engagement commercial n’est supposé par le code.

Avant ouverture, contrôler manuellement que les trois liens conduisent bien aux bons textes publics, que les coordonnées affichées sont exactes et que le support reçoit les messages. Ne pas renseigner des valeurs fictives pour lever le verrou de lancement. Si un champ ne convient pas à la situation du vendeur, adapter explicitement les exigences du lancement après examen de cette situation.

## Comportement technique

`getLaunchInformation()` ne lit que ces sept variables et remplace les valeurs rejetées par `null`. `launchInformationReady(env = process.env)` exige les sept valeurs acceptées. La validation contrôle le format des valeurs et quelques marqueurs de remplacement courants ; elle ne peut pas reconnaître toute donnée fictive ni certifier un vendeur ou un document.

Les liens internes permettent de passer d’une page à l’autre et de revenir à l’application. Les seuls liens externes publiés sont les URL HTTPS acceptées. L’adresse du support est affichée en texte sélectionnable. Lorsque toutes les valeurs sont présentes, l’avis provisoire disparaît et ces pages deviennent indexables ; ce changement ne remplace pas la revue des informations avant lancement.
