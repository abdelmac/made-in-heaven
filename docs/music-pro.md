# Ambiances audio

Le lecteur persistant propose choix de piste, lecture/pause, volume, boucle et arrêt pendant les pauses du minuteur. Il reste monté pendant la navigation entre les pages. La lecture commence uniquement après un clic sur « Écouter », jamais au chargement ni après un changement de piste. Le son de fin du minuteur reste indépendant.

En mode local, deux boucles originales de 12 secondes (« Pluie douce » et « Ondes calmes ») sont synthétisées en WAV sur l’appareil. Ce sont des aperçus sonores générés, pas des enregistrements ni un catalogue musical hébergé. Aucune requête audio externe n’est nécessaire.

Pour un compte connecté, les ambiances nécessitent les droits `music` du forfait Pro personnel ou Team de l’organisation. Un lecteur membre d’une organisation Team peut écouter ; un compte extérieur ne peut pas accéder au catalogue. Si aucun fichier autorisé n’a été ajouté, le lecteur affiche un catalogue vide.

## Accès serveur

`GET /api/audio?workspaceId=UUID` renvoie jusqu’à 100 pistes actives avec leurs titres, attributions, durées et catégories, sans chemins de stockage. Ajouter `trackId=UUID` demande une URL signée valable 120 secondes. La route vérifie à chaque demande l’authentification, l’appartenance à l’espace, la limite persistante de 60 demandes par minute et les droits Pro/Team calculés côté serveur. Les URLs arbitraires fournies par le navigateur sont refusées.

La migration `0010_pro_audio.sql` ajoute la capacité `music` sans changer le calcul des périodes payées, crée le catalogue serveur `audio_tracks` et, sur Supabase Storage, le bucket privé `pro-audio`. La table refuse l’accès direct des clients. Une politique Storage restrictive exclut ce bucket des accès anonymes et authentifiés, même si une autre politique client est permissive. Seul le service serveur signe les fichiers après autorisation.

Les réponses API portent `Cache-Control: private, no-store`. Le service worker existant ignore les routes API et les médias sur un domaine externe. Les URLs signées ne sont jamais enregistrées en localStorage. Le navigateur peut conserver des octets déjà téléchargés ; un lien reste utilisable jusqu’à son expiration. Cette protection n’est pas un mécanisme DRM, comme l’expliquent les [modèles d’accès des buckets Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals) et les [téléchargements signés](https://supabase.com/docs/guides/storage/serving/downloads).

Le lecteur redemande une autorisation à chaque clic de lecture d’une piste hébergée, y compris après pause ou erreur. Un changement de compte ou d’espace, une déconnexion ou une perte des droits observée par l’application démontent le lecteur, arrêtent le son et retirent sa source. La piste, le volume, la boucle et l’option de pause sont enregistrés dans le préfixe de stockage existant de l’espace ; le nettoyage du cache du compte les supprime à la déconnexion.

## Préparer le catalogue hébergé

1. Appliquer les migrations dans l’ordre jusqu’à `0010_pro_audio.sql` sur le projet Supabase prévu. Le test PostgreSQL seul n’a pas de service Storage et ignore sa création de bucket ; contrôler également le bucket et ses politiques sur Supabase.
2. Depuis un compte opérateur autorisé, importer uniquement vos propres enregistrements ou des fichiers dont vous possédez les droits nécessaires dans le bucket **privé** `pro-audio`. MP3, AAC/MP4, Ogg et WAV sont acceptés, jusqu’à 50 Mo par fichier. Ne pas créer de politique de lecture publique.
3. Ajouter les entrées au catalogue avec le chemin exact du fichier. Exemple à adapter avant exécution, sans clé dans le SQL :

   ```sql
   insert into public.audio_tracks
     (title, attribution, duration_seconds, category, storage_path, active)
   values
     ('Ma pluie', 'Enregistrement original — votre nom', 120, 'ambient', 'owned/pluie.mp3', true);
   ```

4. Avec un compte Pro/Team de test, vérifier le catalogue, la lecture réelle, les attributions et les reprises après expiration du lien. Vérifier qu’un utilisateur Free/non membre ne peut ni signer une piste ni lire directement le bucket.

Aucun fichier hébergé, upload, clé supplémentaire ou abonnement musical n’a été créé par cette implémentation. Les clés Supabase serveur existantes suffisent à l’API. Les liens Spotify/Apple Music ne sont pas des fichiers audio acceptés par ce lecteur.

## Vérifications et limites

Les tests unitaires simulent Supabase pour couvrir non-membres, lecteur Team, forfait Free/rétrogradé, limite de requêtes, erreurs de signature et sélection dans le catalogue autorisé. Ils contrôlent aussi le format WAV et l’amplitude bornée des aperçus. Les tests navigateur vérifient l’aperçu local ; ils ne constituent pas un test d’écoute des fichiers hébergés.

Si le navigateur bloque `audio.play()`, le lecteur affiche une erreur et permet un nouveau clic. Le comportement dépend du navigateur, notamment après une requête réseau, en arrière-plan ou écran verrouillé ; voir la [documentation du démarrage de lecture](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play). Il n’y a pas de lecture automatique après une pause du minuteur, de mixeur, de fondu entre pistes ni de téléchargement hors ligne du catalogue Pro.
