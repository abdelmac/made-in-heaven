# Activer les emails de compte

Les modèles sont prêts dans le dépôt, mais aucun domaine d’envoi ni fournisseur SMTP n’a été configuré par cette préparation. Aucun email n’a été envoyé. Suivre aussi le [guide de lancement](launch-runbook.md).

## Domaine et service d’envoi

Choisir un domaine dont vous contrôlerez les réglages DNS et un fournisseur d’emails transactionnels compatible SMTP. Vérifier leurs coûts et limites avant tout achat ou activation : aucune gratuité n’est supposée. Le site peut garder son adresse de déploiement HTTPS ; le domaine d’envoi sert à authentifier l’expéditeur.

Dans les réglages DNS du domaine, ajouter les enregistrements demandés par le fournisseur pour SPF, DKIM et DMARC. Copier ses valeurs exactes et attendre sa validation du domaine. Puis relever son hôte SMTP, port, identifiant, mot de passe et adresse d’expédition autorisée.

Dans Supabase, ouvrir **Authentication → Email → SMTP Settings** (ou rechercher « Custom SMTP »), activer le SMTP personnalisé et saisir ces informations ; choisir « Solace » comme nom d’expéditeur. Conserver les identifiants dans les réglages privés du fournisseur, jamais dans Git. Vérifier les quotas et les erreurs de livraison. Le SMTP Supabase par défaut est limité aux adresses de l’équipe du projet et ne convient pas à l’ouverture publique. [Documentation SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Garder **Confirm email** activé dans le fournisseur d’authentification Email. Une panne d’envoi doit être corrigée, sans désactiver la confirmation des comptes.

## Adresses de retour et modèles

Dans **Authentication → URL Configuration**, définir **Site URL** sur l’origine HTTPS canonique du site, sans chemin ni barre oblique finale, identique à `NEXT_PUBLIC_APP_URL`. Ci-dessous, remplacer `ORIGINE_HTTPS` par cette origine. Ajouter les deux adresses exactes utilisées par l’application à **Redirect URLs** :

```text
ORIGINE_HTTPS/auth/callback
ORIGINE_HTTPS/auth/callback?next=%2F%3Freset-password%3D1
```

Éviter les autorisations générales avec `**` en production. Les modèles ci-dessous reviennent toujours à **Site URL**, y compris lorsqu’une demande part d’un autre déploiement. [Configuration des redirections](https://supabase.com/docs/guides/auth/redirect-urls).

Dans **Authentication → Email → Templates**, copier le HTML intégral du fichier indiqué dans le corps du modèle correspondant :

| Modèle Supabase | Objet proposé                           | Fichier                                                          |
| --------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Confirm sign up | Confirmez votre inscription à Solace    | [confirm-signup.html](../supabase/templates/confirm-signup.html) |
| Reset password  | Réinitialisez votre mot de passe Solace | [recovery.html](../supabase/templates/recovery.html)             |

Laisser `{{ .SiteURL }}` et `{{ .TokenHash }}` tels quels : Supabase les remplit. `&amp;type=signup` et `&amp;type=recovery` sont l’écriture HTML des paramètres attendus par `/auth/callback`. Le serveur vérifie le jeton ; la récupération aboutit à `/?reset-password=1`. Ce parcours accepte une ouverture dans un autre navigateur. Voir le [fonctionnement de l’authentification](security.md).

Désactiver le suivi des liens chez le fournisseur : leur réécriture peut casser la vérification. Les modèles ne chargent aucune image ni ressource externe. [Variables et limites des modèles Supabase](https://supabase.com/docs/guides/auth/auth-email-templates).

## Vérification avant ouverture

Utiliser deux boîtes de test contrôlées par vous, chez des services différents, **sans les ajouter à l’équipe Supabase**. Pour chacune :

1. Créer un compte depuis le site et vérifier la réception, y compris les indésirables. Avant confirmation, la connexion doit rester refusée.
2. Ouvrir le lien une seule fois, dont un essai dans un autre navigateur. Vérifier l’adresse canonique, la confirmation et l’accès au compte.
3. Se déconnecter, demander une récupération et ouvrir le nouveau lien. Choisir un nouveau mot de passe, puis vérifier que la nouvelle connexion fonctionne et que l’ancien mot de passe est refusé.
4. Vérifier qu’un lien déjà utilisé ou expiré affiche un échec de vérification. En cas de lien invalide dès réception, examiner le suivi des liens et les scanners de la messagerie, qui peuvent consommer un lien avant son ouverture. [Limites des liens email](https://supabase.com/docs/guides/auth/auth-email-templates#limitations).

Noter les résultats sans conserver mots de passe, jetons ou URL complètes de confirmation. Un aperçu du modèle ou une acceptation SMTP ne prouve pas la réception ni le bon fonctionnement du parcours. Garder `SOLACE_AUTH_EMAIL_VERIFIED=false` tant que ces essais réels ne sont pas réussis sur le projet destiné à l’ouverture ; voir le [guide de lancement](launch-runbook.md).

Les invitations d’organisation suivent un circuit séparé : `RESEND_API_KEY` et `INVITATION_EMAIL_FROM` concernent l’envoi optionnel via Resend, pas les emails d’authentification Supabase. Configurer l’un n’active pas l’autre. Voir [invitations.md](invitations.md).
