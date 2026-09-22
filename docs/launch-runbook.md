# Préparer l’ouverture de Solace

État au 22 septembre 2026 : **pas d’ouverture des paiements réels**. La migration `0011` est maintenant appliquée sur `zwgjauskorkpucuaqvgs`, avec liaison `test/NULL`, sans changement des deux comptes et deux espaces existants. Connexion, synchronisation entre deux navigateurs et droits Free ont été revérifiés avec un compte temporaire ensuite supprimé. Le nouveau code applicatif n’est pas encore publié. Aucun abonnement payant, achat de domaine, forfait d’hébergement ou service e-mail n’a été souscrit.

Offre validée : **Free gratuit ; Pro 3,99 €/mois ou 29,99 €/an**, payé annuellement. Team reste fermé. Le catalogue audio hébergé est vide : ne pas le présenter comme un avantage disponible à l’achat.

## 1. Remplacer la clé exposée — avant tout

Une clé Stripe secrète a été trouvée dans `.env.example` et dans sa version Git déjà enregistrée. La copie actuelle du fichier a été nettoyée, **pas l’historique**. Révoquer/remplacer cette clé dans Stripe, puis mettre sa remplaçante uniquement dans `.env.local` et les variables serveur du bon projet d’hébergement. Ne jamais la coller dans un message. Vérifier l’usage de l’ancienne clé dans Stripe ; une purge de l’historique partagé devra être coordonnée séparément, elle ne remplace pas la révocation.

`npm run security:secrets` refuse les motifs de clés Stripe dans les fichiers suivis ou non ignorés. Le contrôle fait aussi partie de la CI. Il ne scanne pas tout l’historique, tous les fournisseurs, ni toutes les formes de secret. [Gestion et rotation des clés Stripe](https://docs.stripe.com/keys).

## 2. Choisir les services et fournir les informations publiques

- Choisir un hébergement autorisant la vente. L’équipe actuelle est sur Vercel Hobby ; ce forfait est réservé à l’usage personnel/non commercial. Aucun passage payant automatique. [Conditions du forfait Hobby](https://vercel.com/docs/plans/hobby).
- Préparer le domaine d’envoi et un fournisseur SMTP : [procédure e-mail](email-activation.md). Le site peut conserver son URL actuelle pendant la préparation. Ne pas marquer l’e-mail vérifié tant que confirmation et récupération ne fonctionnent pas avec une adresse externe.
- Renseigner les sept champs `SOLACE_*` d’identité/contact/documents décrits dans [launch-content.md](launch-content.md). Publier et relire les véritables textes ; les quatre nouvelles pages sont des points d’accès, pas des contrats générés. Ne pas créer une boucle en faisant pointer une page vers elle-même sans document complet.
- Faire valider le traitement des taxes, les informations affichées avant achat, les conditions de vente/résiliation et la gestion des remboursements pour l’activité réelle. Le code n’active pas Stripe Tax et ne certifie pas la conformité.

Les attestations `SOLACE_COMMERCIAL_HOSTING_CONFIRMED`, `SOLACE_AUTH_EMAIL_VERIFIED` et `SOLACE_LAUNCH_REVIEWED` restent à `false` tant que ces vérifications ne sont pas faites. Ce sont des décisions opérateur, pas des preuves automatiques.

## 3. Préparer un environnement de recette séparé

1. Utiliser un projet Supabase de recette et une clé Stripe **test/sandbox** valides. Ne pas utiliser la clé live pour simuler un achat.
2. Appliquer les migrations `0001` à `0011` dans l’ordre sur ce projet. Conserver les données et les identifiants de l’ancienne installation séparés.
3. Avec une session opérateur privilégiée, lier la base vide au mode et au compte de recette :

   ```sql
   select public.configure_billing_environment('test', 'acct_IDENTIFIANT_REEL');
   ```

   Utiliser le véritable identifiant du compte. Pour une base historique test déjà occupée, garder la liaison initiale `(test, NULL)` et `STRIPE_ACCOUNT_ID` vide ; ne pas forcer son changement. La migration préserve les droits test existants dans leur environnement test.

4. Dans Stripe, créer **Solace Pro** avec deux prix récurrents EUR, facturation à l’unité, quantité 1 : mois **399** centimes, année **2999** centimes, sans essai. Remplir les deux identifiants `STRIPE_PRO_*_PRICE_ID`. Laisser tous les identifiants Team vides.
5. Créer un portail Pro avec historique des factures, mise à jour du moyen de paiement et résiliation en fin de période. Désactiver les changements de quantité. Les changements de prix peuvent rester désactivés ; s’ils sont proposés, limiter aux deux prix Pro et relire les prorations.
6. Créer un webhook snapshot **pour cette installation**, sur `/api/billing/webhook`, avec les 13 événements de [billing.md](billing.md#setup), sans Connect. Utiliser la version compatible SDK `2026-08-26.dahlia` et son propre secret de signature. Ne pas modifier le webhook de l’ancien site.
7. Mettre les valeurs privées de `.env.example` dans l’environnement de recette : mode `test`, compte correspondant, clé test, prix, portail, webhook et Supabase du même projet. Garder toutes les attestations live fermées.

La commande `npm run launch:check` vérifie les formats localement. `npm run launch:check -- --online` effectue uniquement des lectures Stripe et une assertion de liaison Supabase ; elle ne crée ni paiement, ni ressource, ni migration. Elle charge les fichiers d’environnement avec la priorité de production de Next.js. Lancer chaque contrôle avec les variables du projet à vérifier, jamais un mélange recette/production. Les messages ne contiennent aucune valeur de clé. Un code de sortie 1 signifie qu’il reste des éléments à régler.

Les droits de clé doivent permettre les lectures utilisées et les opérations métier nécessaires (clients, sessions Checkout, facturation et portail). Le contrôle en lecture ne prouve pas les permissions d’écriture. Ne pas ajouter une permission sans rapport avec l’application uniquement pour faire disparaître un avertissement Stripe.

## 4. Vérifier le parcours hébergé en test

- Inscription depuis une adresse externe, confirmation réelle reçue, connexion, récupération du mot de passe et nouveau mot de passe utilisable.
- Compte Free → choix mensuel puis, avec un autre compte de recette, annuel ; total affiché conforme, paiement avec une carte de test Stripe.
- Webhook signé `invoice.paid` effectivement reçu → Pro attribué dans la bonne base, puis visible sur un deuxième appareil. Un retour `?checkout=success` seul ne doit pas donner Pro.
- Double clic/rechargement pendant Checkout : pas de deuxième abonnement ; échec initial de paiement : pas de Pro indu.
- Portail : facture accessible, mise à jour de carte et résiliation en fin de période ; Pro conservé jusqu’au terme payé.
- Renouvellement réussi/échoué, expiration de la couverture et événements dupliqués/hors ordre. Rejouer les erreurs ; aucun reçu `pending`/`failed` inexpliqué.
- Refus d’un webhook du mode opposé et refus des demandes d’un non-propriétaire.

Ne jamais saisir de carte réelle en test, ni de carte de test en live. Les tests automatisés avec mocks ne remplacent pas cette recette hébergée. [Outils de test Stripe Billing](https://docs.stripe.com/billing/testing).

## 5. Préparer la production, encore fermée

Utiliser **une base de facturation sans historique test**. Une base avec utilisateurs Free peut être liée au live seulement si elle n’a aucun client Stripe, tentative Checkout, abonnement, droit payé/essai ou événement de facturation. `configure_billing_environment` refuse une base occupée ; ne jamais contourner ce refus en supprimant les historiques ou en modifiant les colonnes directement.

1. Sauvegarder et vérifier le projet cible. Appliquer `0011` avant le nouveau code. Prévoir une fenêtre sans requêtes pour la liaison initiale et le déploiement.
2. Créer les prix/portail/webhook **live** avec la même offre et l’origine finale ; les identifiants test ne sont pas réutilisables en live.
3. Lier explicitement la base vide :

   ```sql
   select public.configure_billing_environment('live', 'acct_IDENTIFIANT_REEL');
   ```

4. Configurer `STRIPE_BILLING_MODE=live`, le même `STRIPE_ACCOUNT_ID`, la **nouvelle clé privée** live, les IDs live et les variables serveur Supabase du bon projet. Garder `STRIPE_LIVE_CHECKOUT_ENABLED=false`.
5. Déployer uniquement sur l’hébergement commercial validé. Ouvrir `/api/billing/prices` : mode `live`, prix exacts, `checkoutEnabled:false` et chaque `checkoutAvailable:false`. Les pages vendeur/support ne doivent plus être des brouillons.
6. Exécuter les contrôles local et distant avec ces valeurs de production. Vérifier aussi manuellement le contact support Stripe, les trois documents publics, l’origine/redirections Auth, les e-mails et la configuration Stripe de vente/taxes. Le secret de webhook ne peut pas être validé par simple lecture : constater une livraison signée.

À cette étape, `À FAIRE` et le code de sortie 1 pour `STRIPE_LIVE_CHECKOUT_ENABLED` sont **attendus**, puisque le paiement doit rester fermé. Même chose pour une attestation pas encore acquise. Ne pas mettre les flags à `true` pour obtenir artificiellement un contrôle vert : corriger les autres écarts, finir la recette, puis décider explicitement de l’ouverture.

Si le déploiement passe par GitHub Actions, le nouveau verrou de dépôt `SOLACE_BILLING_MIGRATION_0011_READY` doit être confirmé seulement après vérification de la migration et de la liaison sur la cible. Il s’ajoute au flag de déploiement existant ; voir [l’automatisation](development-automation.md). Aucune variable distante n’a été changée pendant cette préparation.

Ne jamais changer le mode d’une base occupée pour revenir au test. La base, le compte, la clé, les prix, les portails et les événements doivent rester dans le même environnement. Les nouvelles routes refusent une incohérence, y compris pour les fonctions premium.

## 6. Ouvrir et surveiller

Après recette et revue complète seulement, passer les trois attestations opérateur à `true`, puis `STRIPE_LIVE_CHECKOUT_ENABLED=true` et redéployer. Le vendeur et ses trois URL doivent également être valides. Une clé live seule ne suffit pas.

Contrôler un premier parcours réel autorisé par le propriétaire, les factures, l’attribution des droits et la résiliation ; aucun achat réel n’est lancé par les scripts fournis. Surveiller les erreurs serveur, les livraisons Stripe et les reçus `billing_events` échoués. [Checklist d’ouverture Stripe](https://docs.stripe.com/get-started/checklist/go-live).

Pour arrêter **les nouvelles ventes**, remettre uniquement `STRIPE_LIVE_CHECKOUT_ENABLED=false` et redéployer. Conserver mode, compte, base, secrets et webhook : les abonnés doivent encore consulter leurs factures, résilier et recevoir leurs droits. Ce verrou n’annule pas une session Checkout déjà ouverte chez Stripe ; traiter explicitement ces sessions côté opérateur si une fermeture immédiate est nécessaire.

## Validation locale avant chaque livraison

```sh
npm run security:secrets
npm run format:check
npm run lint
npm test
node scripts/verify-database.mjs
npm run build
npm run typecheck
npm run test:browser
```

`verify-database.mjs` utilise le runtime PGlite isolé installé par la CI (voir `.github/workflows/ci.yml`). Pour les scénarios navigateur connectés sans fournisseur réel, fournir les valeurs publiques factices documentées dans `e2e/billing.spec.ts` ; les clés serveur restent vides et les réponses cloud sont simulées.
