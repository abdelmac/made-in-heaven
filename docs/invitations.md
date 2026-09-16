# Invitations d’équipe

Dans Organisation, un propriétaire ou administrateur d’une organisation avec un forfait Team actif peut créer une invitation liée à une adresse e-mail. Le lien expire après 7 jours. Le destinataire doit se connecter avec cette même adresse pour l’accepter ; les rôles, révocations et limites de membres restent contrôlés par la base de données. Seul un propriétaire peut inviter un administrateur.

La case « Envoyer aussi l’invitation par e-mail » ajoute un envoi via Resend, après création réussie de l’invitation. Elle est décochée par défaut et indisponible lorsque l’envoi n’est pas configuré. L’utilisateur peut toujours copier le lien créé. Les invitations sans cette case cochée ne contactent aucun fournisseur d’e-mail.

## Configuration serveur

- `RESEND_API_KEY` : clé Resend serveur avec permission d’envoi, jamais `NEXT_PUBLIC_`.
- `INVITATION_EMAIL_FROM` : adresse simple sur un domaine vérifié, par exemple `invitations@votre-domaine.fr`, sans nom d’affichage. Solace ajoute son nom automatiquement.
- `NEXT_PUBLIC_APP_URL` : origine HTTPS canonique du site, sans chemin, paramètres ou identifiants. Un lien localhost n’est jamais envoyé par ce service.

Vérifier le domaine expéditeur et ses enregistrements DNS dans Resend avant activation. La présence des variables permet d’afficher la case ; seule une réponse du fournisseur peut confirmer qu’il accepte l’envoi. Les prérequis expéditeur viennent de la [documentation Resend sur les domaines et expéditeurs](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend).

L’adaptateur utilise l’[API officielle `POST /emails`](https://resend.com/docs/api-reference/emails/send-email), avec un message texte français, une limite de 8 secondes et une clé d’idempotence liée à l’identifiant d’invitation. Les envois sont limités à 5 tentatives par utilisateur par minute, en plus de la limite existante de gestion des espaces. Le jeton reste haché en base ; le lien complet est uniquement dans la réponse privée et dans le message demandé. Aucune clé, aucun lien complet et aucun message d’erreur brut du fournisseur n’est journalisé.

## Ce que signifie le résultat

| État API         | Résultat affiché                                                                     |
| ---------------- | ------------------------------------------------------------------------------------ |
| `not_requested`  | Lien créé, aucun e-mail demandé.                                                     |
| `not_configured` | Lien créé, service d’envoi indisponible.                                             |
| `accepted`       | Le fournisseur a accepté le message ; la réception n’est pas confirmée.              |
| `failed`         | Le fournisseur a refusé la demande ; le lien reste utilisable.                       |
| `unknown`        | Délai dépassé, réponse ambiguë ou panne réseau : le message a peut-être été accepté. |

Un échec d’envoi ne supprime pas l’invitation. Copier le lien permet de poursuivre. Si le lien n’a pas été conservé, révoquer l’invitation existante puis en créer une nouvelle. Il n’y a pas de renvoi automatique, de suivi de réception ou de file de reprises ; l’état d’envoi affiché correspond uniquement à la création courante. Les rebonds et la livraison doivent être consultés chez le fournisseur. Ne pas annoncer « reçu » sur la seule base d’un succès API.

Les tests utilisent un fournisseur simulé : absence de configuration, refus, acceptation, panne, protections des rôles et des forfaits, absence d’envoi sans consentement. Aucun e-mail réel n’a été envoyé pour implémenter cette fonctionnalité. La réception de bout en bout nécessite un domaine vérifié, les variables de déploiement et un destinataire de test consentant.
