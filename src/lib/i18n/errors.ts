/** Keep domain errors stable; translate only at the presentation boundary. */
const messages: Record<string, string> = {
  'An active timer needs a complete frozen session context.': 'La séance active doit conserver toutes ses informations d’origine.',
  'Remaining time exceeds the session duration.': 'Le temps restant dépasse la durée de la séance.',
  'A prepared timer cannot retain an active session identity.': 'Un minuteur prêt ne peut pas conserver l’identifiant d’une séance active.',
  'A paused timer must not have a running deadline.': 'Un minuteur en pause ne peut pas conserver une échéance active.',
  'Duplicate record IDs are not allowed.': 'Les identifiants des éléments doivent être uniques.',
  'Every record must belong to this workspace.': 'Tous les éléments doivent appartenir à cet espace.',
  'A note or flashcard deck must link to a subject in this workspace.': 'La matière liée à cette note ou à ce paquet doit appartenir à cet espace.',
  'A flashcard needs a deck in this workspace.': 'La carte doit appartenir à un paquet de cet espace.',
  'A flashcard and its deck must have the same author.': 'La carte et son paquet doivent avoir le même auteur.',
  'A subject completion note needs a linked subject.': 'Le bilan de fin de matière doit être lié à une matière.',
  'A session reflection needs a completed focus session.': 'Le bilan doit être lié à une séance de concentration terminée.',
  'A note must link to its author’s completed focus session and matching subject.': 'La note doit être liée à une séance terminée de son auteur et à la même matière.',
  'Checklist items must have unique IDs across this workspace.': 'Les sous-tâches doivent avoir des identifiants uniques dans cet espace.',
  'A linked subject does not exist in this workspace.': 'Une matière liée n’existe pas dans cet espace.',
  'A project and its subject must match.': 'Le projet doit appartenir à la matière sélectionnée.',
  'A planned session must match its linked task context.': 'La séance prévue doit utiliser la même matière et le même projet que sa tâche.',
  'A journal entry needs an existing task.': 'Une note de travail doit être liée à une tâche existante.',
  'A journal entry must link to a session for the same task.': 'La note de travail doit être liée à une séance de la même tâche.',
  'Focus session snapshots must match their workspace and actor.': 'Les séances enregistrées doivent correspondre à leur espace et à leur auteur.',
  'Incomplete focus time cannot be marked completed.': 'Une séance inachevée ne peut pas être marquée comme terminée.',
  'Recorded focus time cannot exceed the configured session duration.': 'Le temps enregistré ne peut pas dépasser la durée prévue de la séance.',
  'Recorded focus time cannot exceed the elapsed session time.': 'Le temps enregistré ne peut pas dépasser le temps écoulé.',
  'The active timer must belong to this workspace.': 'Le minuteur actif doit appartenir à cet espace.',
  'Planned sessions overlap for the same person.': 'Des séances prévues se chevauchent pour la même personne.',
  'This workspace changed in another tab. Review the saved version before continuing.': 'Cet espace a changé dans un autre onglet. Vérifiez la version enregistrée avant de continuer.',
  'The import exceeds the 25 MB size limit.': 'Le fichier à importer dépasse la limite de 25 Mo.',
  'This adds the imported productivity records to this workspace. Roles, memberships and billing are never imported. Active timers are not resumed.': 'Les éléments importés seront ajoutés à cet espace. Les rôles, membres et abonnements ne sont jamais importés. Les minuteurs actifs ne sont pas repris.',
  'Saved focus history cannot be rewritten.': 'L’historique des séances enregistrées ne peut pas être réécrit.',
  'You can only record your own focus sessions.': 'Vous pouvez uniquement enregistrer vos propres séances.',
  'Completed sessions must retain the original timer context.': 'Les séances terminées doivent conserver leurs informations d’origine.',
  'A session cannot end before it starts.': 'Une séance ne peut pas finir avant son début.',
  'Saved focus history must be preserved.': 'L’historique des séances doit être conservé.',
  'Saved activity history cannot be rewritten.': 'L’historique d’activité enregistré ne peut pas être réécrit.',
  'You can only record activity as yourself.': 'Vous pouvez uniquement enregistrer votre propre activité.',
  'Saved activity history must be preserved.': 'L’historique d’activité doit être conservé.',
  'You can only change your own planned sessions.': 'Vous pouvez uniquement modifier vos propres séances prévues.',
  'A planned session cannot be transferred to another person.': 'Une séance prévue ne peut pas être transférée à une autre personne.',
  'A planned session must belong to a workspace member.': 'La séance prévue doit appartenir à un membre de cet espace.',
  'Restore this subject before planning new work.': 'Restaurez cette matière avant de prévoir du nouveau travail.',
  "You cannot delete another member's planned sessions.": 'Vous ne pouvez pas supprimer les séances prévues d’un autre membre.',
  'Assign tasks to a current workspace member.': 'Attribuez les tâches à un membre actuel de cet espace.',
  'You can only edit your own journal entries.': 'Vous pouvez uniquement modifier vos propres notes de travail.',
  'A journal author cannot be changed.': 'L’auteur d’une note de travail ne peut pas être modifié.',
  'Keep the previous journal content in its revision history.': 'Conservez le contenu précédent dans l’historique de la note de travail.',
  'Journal revisions cannot be rewritten.': 'Les versions précédentes des notes de travail ne peuvent pas être réécrites.',
  "You cannot delete another member's journal entries.": 'Vous ne pouvez pas supprimer les notes de travail d’un autre membre.',
  'You can only create or edit your own notes and flashcards.': 'Vous pouvez uniquement créer ou modifier vos propres notes et cartes mémoire.',
  "You cannot delete another member's notes or flashcards.": 'Vous ne pouvez pas supprimer les notes ou cartes mémoire d’un autre membre.',
  'Keep the previous note title and content in revision history.': 'Conservez le titre et le contenu précédents dans l’historique de la note.',
  'Note revisions cannot be rewritten.': 'Les versions précédentes des notes ne peuvent pas être réécrites.',
  'An active timer must belong to you.': 'Le minuteur actif doit vous appartenir.',
  'Restore this subject before starting new focus.': 'Restaurez cette matière avant de lancer une séance.',
  'Choose an active project in the selected subject.': 'Choisissez un projet actif dans la matière sélectionnée.',
  'The active task must match the selected subject and project.': 'La tâche active doit correspondre à la matière et au projet sélectionnés.',
  "An active session's original context and duration are frozen.": 'Les informations et la durée d’une séance active ne peuvent pas être modifiées.',
  'Saved workspace data could not be validated for analytics.': 'Les données enregistrées de cet espace n’ont pas pu être validées pour les statistiques.',
  'Sign in to continue.': 'Connectez-vous pour continuer.',
  'You do not have access to this workspace.': 'Vous n’avez pas accès à cet espace.',
  'Your workspace role does not allow this action.': 'Votre rôle dans cet espace ne permet pas cette action.',
  'This workspace is not available.': 'Cet espace n’est pas disponible.',
  'Server credentials are not configured.': 'Les identifiants du serveur ne sont pas configurés.',
  'Too many requests. Please try again shortly.': 'Trop de demandes. Réessayez dans un instant.',
  'This request must come from Folia.': 'Cette demande doit provenir de Solace.',
  'Cross-site requests are not allowed.': 'Les demandes provenant d’un autre site ne sont pas autorisées.',
  'Send a JSON request.': 'La demande doit être au format JSON.',
  'This workspace is too large to save.': 'Cet espace est trop volumineux pour être enregistré.',
  'The request contains invalid JSON.': 'La demande contient un document JSON invalide.',
  'Please check the submitted values.': 'Vérifiez les valeurs saisies.',
  'Folia could not finish this request. Please try again.': 'Solace n’a pas pu terminer cette demande. Réessayez.',
  'The database rejected this operation.': 'La base de données a refusé cette opération.',
  'This completion overlaps with another focus session on your account. Review the conflicting offline sessions before saving.': 'Cette séance chevauche une autre séance de votre compte. Vérifiez les séances hors ligne en conflit avant d’enregistrer.',
  'This planned time overlaps with another session on your account, possibly in another workspace.': 'Ce créneau chevauche une autre séance de votre compte, éventuellement dans un autre espace.',
  'Cloud storage is not ready. Check the database configuration and migrations.': 'Le stockage en ligne n’est pas prêt. Vérifiez la configuration et les migrations de la base de données.',
  'Choose a JPG, PNG, or WebP image.': 'Choisissez une image JPG, PNG ou WebP.',
  'Choose an image smaller than 8 MB.': 'Choisissez une image de moins de 8 Mo.',
  'Choose an image smaller than 40 megapixels.': 'Choisissez une image de moins de 40 mégapixels.',
  'This browser could not prepare your image.': 'Ce navigateur n’a pas pu préparer votre image.',
  'This image is too detailed to save. Try a smaller image.': 'Cette image est trop détaillée pour être enregistrée. Essayez une image plus petite.',
  'This image could not be opened. Try another JPG, PNG, or WebP file.': 'Cette image n’a pas pu être ouverte. Essayez un autre fichier JPG, PNG ou WebP.',
  'Pause or reset the active timer before starting another session.': 'Mettez en pause ou réinitialisez le minuteur avant de lancer une autre séance.',
  'Only the person assigned to a planned session can start it.': 'Seule la personne à qui la séance est attribuée peut la lancer.',
  'This planned session is already completed.': 'Cette séance prévue est déjà terminée.',
  'The selected task no longer exists.': 'La tâche sélectionnée n’existe plus.',
  'Restore the archived subject before starting new work.': 'Restaurez la matière archivée avant de reprendre le travail.',
  'Choose an active project.': 'Choisissez un projet actif.',
  'Choose a project in the selected subject.': 'Choisissez un projet dans la matière sélectionnée.',
  'Focus duration must be between 1 and 180 minutes.': 'La durée de concentration doit être comprise entre 1 et 180 minutes.',
  'This note no longer exists.': 'Cette note n’existe plus.',
  'Only the author can edit this note.': 'Seul l’auteur peut modifier cette note.',
  'This subject no longer exists.': 'Cette matière n’existe plus.',
  'Add a card before starting a study session.': 'Ajoutez une carte avant de commencer une révision.',
  'Study cards must be unique.': 'Les cartes à réviser doivent être uniques.',
  'Reveal the answer before rating this card.': 'Affichez la réponse avant d’évaluer cette carte.',
  'Your display name could not be saved.': 'Votre nom affiché n’a pas pu être enregistré.',
  'Your account could not be deleted.': 'Votre compte n’a pas pu être supprimé.',
  'Invalid login credentials': 'Adresse e-mail ou mot de passe incorrect.',
  'Email not confirmed': 'Confirmez votre adresse e-mail avant de vous connecter.',
  'User already registered': 'Un compte existe déjà avec cette adresse e-mail.',
  'Email rate limit exceeded': 'Trop d’e-mails ont été demandés. Réessayez dans un instant.',
  'Failed to fetch': 'Connexion impossible. Vérifiez votre accès à Internet et réessayez.',
  'Load failed': 'Le chargement a échoué. Vérifiez votre connexion et réessayez.',
  'NetworkError when attempting to fetch resource.': 'Erreur réseau. Vérifiez votre connexion et réessayez.',
};

function validationMessage(message: string) {
  if (/^Invalid (email|URL|UUID|datetime|date|time)/i.test(message)) return 'Le format de la valeur est invalide.';
  const min = message.match(/^Too small: expected (string|number|array) to have >=(\d+) (characters|items)$/);
  if (min) return min[1] === 'string' ? `Saisissez au moins ${min[2]} caractère(s).` : `Ajoutez au moins ${min[2]} élément(s).`;
  const max = message.match(/^Too big: expected (string|number|array) to have <=(\d+) (characters|items)$/);
  if (max) return max[1] === 'string' ? `Saisissez au maximum ${max[2]} caractère(s).` : `Ajoutez au maximum ${max[2]} élément(s).`;
  const bound = message.match(/^Too (small|big): expected number to be (>=|<=)(-?[\d.]+)$/);
  if (bound) return `La valeur doit être ${bound[1] === 'small' ? 'supérieure ou égale' : 'inférieure ou égale'} à ${bound[3]}.`;
  if (/^Invalid (input|option)|^Unrecognized key|^Invalid string|^Too (small|big):/.test(message)) return 'Vérifiez le format et les limites de cette valeur.';
  return undefined;
}

export function localizeError(message: string): string {
  const exact = messages[message];
  if (exact) return exact;
  const validation = validationMessage(message);
  if (validation) return validation;
  // ZodError.message serializes its issues; present their messages without the internal JSON.
  if (message.trimStart().startsWith('[')) {
    try {
      const issues: unknown = JSON.parse(message);
      if (Array.isArray(issues) && issues.length && issues.every((issue) => issue && typeof issue === 'object' && typeof issue.message === 'string')) {
        return [...new Set(issues.map((issue: { message: string }) => localizeError(issue.message)))].join(' ');
      }
    } catch {
      // Non-JSON messages (including user content) remain intact.
    }
  }
  if (/^(Unexpected (token|end)|Expected (property name|double-quoted property name))/.test(message)) return 'Le fichier JSON est invalide. Vérifiez votre sauvegarde.';
  return message;
}
