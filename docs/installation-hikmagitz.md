# Nouvelle installation Solace — 21 septembre 2026

Cette installation est indépendante de l’ancien site `folia-ennearock.vercel.app`.
Aucune donnée, clé ou souscription de cet ancien environnement n’a été copiée ou
modifiée.

## Cibles

- Site public : <https://solace-hikmagitz.vercel.app>.
- Vercel : équipe `hikmagitzs-projects`, projet `solace-hikmagitz`, identifiant
  `prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2`, forfait Hobby, Next.js et Node.js 22.x.
- Publication initiale : `dpl_t9Wj9Y9Tn7C3FsPCCFczMjFTq18p`, état `READY`.
- Supabase : projet **Solace Hikmagitz**, référence `zwgjauskorkpucuaqvgs`,
  organisation `jdrkvtqfxktadfjdwqjo`, forfait Free, région Paris (`eu-west-3`).
- PostgreSQL : 17.6. Les migrations `0001` à `0011` ont été appliquées dans
  l’ordre, chacune dans une transaction (`0011` le 22 septembre). Leurs versions, noms et SQL d’origine
  figurent dans `supabase_migrations.schema_migrations`.

## Mise à niveau du 22 septembre

La seule migration `0011_billing_environment.sql` a été ajoutée après comparaison des dix versions antérieures avec le dépôt. Les deux comptes et deux espaces existants sont conservés. La liaison est `test` avec compte Stripe `NULL` ; aucune variable Stripe n’est configurée dans Vercel Production. Les protections RLS, privilèges des rôles, colonnes de mode et déclencheurs ont été vérifiés sur la base hébergée.

Un compte temporaire dédié a ensuite validé la connexion par mot de passe, la création de son espace Free, l’enregistrement d’une tâche et sa restauration dans un deuxième navigateur. Ce compte, son espace et ses traces de limitation d’appels ont été supprimés et la suppression vérifiée. Aucun e-mail ni paiement n’a été envoyé. Cela ne vérifie pas le SMTP, qui reste absent. Le code applicatif préparé pour le lancement n’a pas encore été redéployé.

## Configuration effectuée

Les quatre variables suivantes sont configurées dans Vercel **Production** :

- `NEXT_PUBLIC_APP_URL` : origine HTTPS du nouveau site.
- `NEXT_PUBLIC_SUPABASE_URL` : URL de la nouvelle base.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` : clé publique moderne dédiée au projet.
- `SUPABASE_SERVICE_ROLE_KEY` : clé secrète moderne, stockée comme secret Vercel,
  jamais comme variable publique.

Les clés ont été transférées directement entre les services, sans les écrire
dans les fichiers versionnés. Le mot de passe initial PostgreSQL a été généré
aléatoirement en mémoire ; pour un accès SQL direct ultérieur, le réinitialiser
depuis le tableau de bord de ce nouveau projet Supabase.

Supabase Auth utilise l’origine du nouveau site et autorise
`https://solace-hikmagitz.vercel.app/auth/callback`. La connexion par e-mail et
mot de passe est activée et la confirmation d’adresse reste obligatoire.
Le bucket `pro-audio` est privé, avec la politique restrictive
`pro_audio_server_only` pour les clients `anon` et `authenticated`.

## Ce qui reste à activer

- **E-mails de compte** : aucun SMTP personnalisé n’est configuré. Le service
  e-mail par défaut de Supabase a des restrictions ; ne pas considérer les
  inscriptions publiques et la récupération par e-mail comme opérationnelles.
  La modification des modèles a été refusée par le fournisseur sur ce forfait
  sans SMTP ; les modèles par défaut sont conservés. Après configuration SMTP,
  suivre les liens de confirmation/récupération dans [security.md](security.md)
  et vérifier leur réception réelle avant ouverture au public.
- **Invitations par e-mail** : configurer un expéditeur et Resend selon
  [invitations.md](invitations.md). Ne pas confondre ce service avec le SMTP Auth.
- **Abonnements** : Stripe est absent de cette nouvelle installation. Les
  espaces connectés démarrent sur Free ; aucun paiement ni abonnement n’a été
  créé. Une configuration Stripe test distincte et son webhook pour la nouvelle
  origine sont nécessaires avant d’activer Pro/Team.
- **Audio Pro** : le catalogue est vide. Ajouter uniquement des fichiers avec
  les droits nécessaires selon [music-pro.md](music-pro.md). L’aperçu local
  original est disponible dans l’espace local.
- **Déploiements automatiques** : aucun compte GitHub ni secret CI n’a été
  configuré. La publication actuelle provient de la CLI ; suivre
  [development-automation.md](development-automation.md) pour automatiser.

## Republier

Après vérification des changements et des éventuelles nouvelles migrations :

```powershell
npx.cmd vercel@59.19.0 link --yes --project solace-hikmagitz --scope hikmagitzs-projects
npx.cmd vercel@59.19.0 deploy --prod --yes --scope hikmagitzs-projects --logs
```

Ne pas exécuter le bootstrap des tests SQL sur la base hébergée. Les résultats
exacts de validation sont consignés dans [verification.md](verification.md).
