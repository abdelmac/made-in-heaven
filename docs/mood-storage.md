# Stockage des humeurs

Chaque espace possède un journal personnel, limité à 730 dates distinctes. Une
entrée contient une date civile, une humeur de 1 à 5, une énergie facultative de
1 à 5, une note de 280 caractères au maximum et sa date de modification. La date
du jour suit le fuseau horaire choisi dans les préférences.

En mode local, le journal reste dans le cache de cet espace sur cet appareil.
Pour un compte connecté, il est enregistré dans les préférences privées du couple
utilisateur/espace. Les autres membres de l’espace ne le voient pas. Les lecteurs
peuvent modifier leurs propres humeurs. Les écritures utilisent la file de
synchronisation existante, y compris hors connexion, avec résolution explicite
des conflits. Une humeur ne crée ni événement partagé ni séance de concentration.

**Sauvegardes :** l’export JSON contient les humeurs personnelles. L’import général
actuel ajoute les données de productivité et conserve les préférences de l’espace
de destination ; il ne restaure donc pas les humeurs du fichier. « Repartir de
zéro » crée un autre espace local avec un journal vide.

Les réponses serveur n’incluent `preferences.moodEntries` que lorsque le client
envoie `X-Folia-Mood-Version: 1`, indépendamment de `X-Folia-Document-Version: 2`.
Les anciennes versions omettent ce champ ; les transactions conservent alors le
journal existant. Seul un tableau explicitement fourni remplace les entrées, et
`[]` les efface. La migration
[`20260924215000_private_mood_preferences.sql`](../supabase/migrations/20260924215000_private_mood_preferences.sql)
doit être appliquée avant de servir la nouvelle interface. Aucune nouvelle table
ni permission de lecture partagée n’est nécessaire.
