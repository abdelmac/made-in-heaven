# Solace : évolution du produit

Cette version ajoute une interface française, un démarrage guidé, des récurrences
explicites, l’export calendrier, un bilan personnel et des invitations par e-mail
configurables. Les identifiants de stockage Folia restent compatibles avec les
données existantes.

## Utilisation

- **Français et Solace** : navigation, formulaires, messages courants, noms de
  jours/mois, métadonnées et téléchargements sont en français. Le format de
  sauvegarde, les clés de stockage et les anciennes URL restent compatibles.
- **Premier objectif** : dans un espace personnel vide, l’accueil propose de
  créer une matière, une tâche et une séance ensemble. Les données sont validées
  avant enregistrement ; aucun temps de travail n’est inventé.
- **Récurrences** : à la création d’une tâche ou d’une séance, choisir une
  répétition quotidienne ou hebdomadaire et de 2 à 52 occurrences. Les séances
  conservent leur heure locale lors des changements d’heure ; les heures
  inexistantes et chevauchements sont signalés avant création. Chaque occurrence
  se modifie et se supprime individuellement. Il n’y a pas de génération infinie.
- **Calendrier** : « Exporter ma semaine (.ics) » dans le planning exporte les
  séances personnelles de la semaine avec les filtres visibles. Importer ce
  fichier dans Google Calendar, Outlook ou Apple Calendar. Il s’agit d’un
  instantané : une modification ultérieure ne met pas le calendrier externe à jour.
- **Bilan** : l’accueil compare les minutes réalisées et prévues, affiche les
  tâches en retard et propose la prochaine tâche réalisable et la préparation
  de demain. Les séances d’autres utilisateurs, pauses, séances ignorées et
  historiques futurs sont exclus des totaux réalisés. Les suggestions sont
  calculées localement, sans envoi à un service d’IA.
- **Audio** : ouvrir « Ambiances audio » en bas de l’application. L’aperçu local
  produit des ambiances originales sur l’appareil. Le catalogue connecté est
  réservé à Pro/Team ; l’écoute continue lors d’un changement de vue, mais ne
  redémarre pas automatiquement après rechargement.
- **Équipes** : un propriétaire/administrateur peut cocher l’envoi d’un e-mail
  d’invitation si le service est configuré. Le lien reste accessible si l’envoi
  échoue. L’interface distingue la prise en charge de l’e-mail et sa réception.

## Gros historiques

`GET /api/sync?transfer=paged` transfère des pages de 250 éléments au maximum et
vise 450 Ko par page. Une note individuelle reste entière, même si elle dépasse
ce seuil. La première page contient les préférences privées de l’utilisateur.
Les pages suivantes doivent présenter la même révision ; un changement concurrent
fait recommencer le chargement, sans publier un état incomplet.

Pour les sauvegardes dépassant 450 Ko, le client envoie les suppressions,
remplacements et insertions via `PATCH /api/sync`. La transaction SQL reconstitue
le document et applique les contrôles existants. Le payload exact est conservé
avant envoi et son empreinte est vérifiée lors des nouvelles tentatives ; les
conflits nécessitent toujours un choix explicite. Les petites sauvegardes et
anciens clients continuent d’utiliser `PUT`.

La limite de 2 Mo porte sur chaque requête, donc sur le delta pour `PATCH`.
Un import contenant plus de 2 Mo de nouveautés n’est pas réparti en plusieurs
transactions : il est refusé et le travail reste exportable localement.
Le serveur charge et projette encore le document complet, et le navigateur le
conserve dans son stockage local. La pagination améliore le transfert réseau ;
elle ne supprime pas les limites de mémoire, de quota local ou de traitement SQL.

## Activation hébergée

1. Appliquer les migrations dans l’ordre, dont `0009_incremental_sync.sql` et
   `0010_pro_audio.sql`, avant d’activer cette version du serveur.
2. Pour les invitations, configurer un expéditeur vérifié et les variables
   serveur décrites dans [invitations.md](invitations.md).
3. Pour l’audio Pro, ajouter des pistes autorisées au stockage privé et au
   catalogue selon [music-pro.md](music-pro.md). Un catalogue vide reste vide.
4. Pour les déploiements après contrôles, configurer l’environnement GitHub et
   les secrets Vercel selon [development-automation.md](development-automation.md).
5. Terminer les essais hébergés de confirmation/récupération de compte et les
   cycles Stripe encore non vérifiés dans [verification.md](verification.md).

Ce dossier ne contient pas les identifiants serveur de ces fournisseurs. Les
changements locaux ne configurent pas les comptes hébergés. Les paiements réels
restent désactivés, et aucun e-mail n’est envoyé par les tests simulés.
