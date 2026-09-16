# Vérifications et déploiement

Le workflow `.github/workflows/ci.yml` vérifie chaque pull request et chaque push sur `main` : installation verrouillée par `npm ci`, format, lint, TypeScript, tests unitaires, build Next.js puis parcours Chromium sur ce build de production. Aucun secret de production n’est accessible au job de vérification. Les tests utilisent le mode local de Solace ; ils ne valident pas les services hébergés. Les traces d’échec navigateur sont conservées 7 jours.

En local, `npm run test:browser` démarre le serveur de développement. Pour vérifier le build final sous PowerShell :

```powershell
npm run build
$env:PLAYWRIGHT_PRODUCTION = 'true'
npm run test:browser
Remove-Item Env:PLAYWRIGHT_PRODUCTION
```

Arrêtez d’abord tout serveur local sur le port 3000 pour que les tests portent bien sur le build attendu. En CI, la réutilisation d’un serveur existant est désactivée.

## Activation GitHub → Vercel

Le code du workflow est prêt ; ajouter ces fichiers ne configure pas les comptes externes. Le job de déploiement reste désactivé tant que la variable de dépôt `VERCEL_DEPLOY_ENABLED` n’est pas exactement `true`.

1. Vérifier le projet Vercel cible et sa configuration de production, notamment `NEXT_PUBLIC_APP_URL`, les clés Supabase, les migrations appliquées et les éventuelles clés Stripe **test** et Resend. Les secrets applicatifs restent dans Vercel ; ils sont récupérés temporairement par `vercel pull` dans le job protégé.
2. Créer l’environnement GitHub `production`, limiter ses déploiements à `main`, puis configurer les éventuelles règles de validation souhaitées. Ajouter ses secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Utiliser un jeton ayant uniquement l’accès nécessaire au projet cible.
3. Définir dans cet environnement la variable `VERCEL_CLI_VERSION` avec une version exacte de la CLI Vercel préalablement vérifiée, au format `MAJOR.MINOR.PATCH`. Le workflow refuse une version vide ou `latest`.
4. Protéger `main` en rendant obligatoire le contrôle `Format, lint, types, unit, build and browser`. Vérifier que toutes les vérifications passent avant activation.
5. Si une intégration Git Vercel déploie déjà le dépôt, choisir un seul déclencheur de production afin d’éviter qu’un déploiement indépendant contourne ce contrôle. Aucun réglage distant n’est modifié automatiquement par ce projet.
6. Définir la variable **de dépôt** `VERCEL_DEPLOY_ENABLED=true`. Les prochains push sur `main`, ou un lancement manuel du workflow sur `main`, déploieront seulement après les vérifications réussies. Les PR ne déploient jamais et ne reçoivent pas les secrets Vercel.

Le déploiement reconstruit la même révision avec les paramètres de production avant de publier `.vercel/output`. Le build local sans services utilisé pour les tests navigateur ne prouve donc pas le fonctionnement des intégrations de production. Après une publication, vérifier connexion, synchronisation, invitation avec un compte de test consentant et webhooks Stripe en sandbox.

Les étapes `vercel pull`, `vercel build --prod` et `vercel deploy --prebuilt --prod` suivent le [guide officiel GitHub Actions de Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel). Le comportement des publications précompilées est documenté dans la [référence Vercel deploy](https://vercel.com/docs/cli/deploy).

## Validation des services externes

Les tests de facturation couvrent localement l’authentification et les rôles, les signatures, doublons, reprises après erreur, événements désordonnés, annulations, périodes déjà payées et refus des clés live. Les résultats hébergés déjà consignés dans [billing.md](billing.md) et [verification.md](verification.md) sont des observations antérieures, pas une nouvelle validation exécutée par cette CI.

Restent à vérifier avec les accès de test appropriés : inscription et réception réelle du message, confirmation et liens expirés, récupération du mot de passe (y compris lien utilisé et deuxième appareil), renouvellement Stripe, paiement refusé puis récupération, expiration des droits, redelivery automatique des événements, accès non propriétaire et Checkout concurrents. Les [invitations d’équipe](invitations.md) ont leur propre service d’envoi ; elles ne configurent pas le SMTP d’authentification Supabase. Aucun paiement live, e-mail réel ni déploiement n’est déclenché par les tests unitaires.
