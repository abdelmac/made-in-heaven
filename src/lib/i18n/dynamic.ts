import type { ActivityEvent, Preferences } from '@/lib/model';

export const widgetLabels: Record<Preferences['widgets'][number], string> = {
  timer: 'Minuteur', activity: 'Activité', tasks: 'Tâches', planner: 'Planning', subjects: 'Matières',
};

export const themeLabels = {
  accent: 'Accent', background: 'Arrière-plan', surface: 'Surface', border: 'Bordure', text: 'Texte',
};

export const colorLabels: Record<string, string> = {
  green: 'Vert jardin', blue: 'Bleu classique', blurple: 'Bleu violet', plum: 'Prune douce',
  rose: 'Rose', cyan: 'Lagon', amber: 'Ambre chaleureux', neutral: 'Anthracite',
};

export const backgroundLabels: Record<string, { name: string; description: string }> = {
  aurora: { name: 'Aurore', description: 'Du violet, du bleu et un peu de lumière stellaire.' },
  dusk: { name: 'Crépuscule', description: 'La chaleur d’une soirée tranquille.' },
  ocean: { name: 'Océan', description: 'Des bleus profonds et de grands espaces.' },
  forest: { name: 'Forêt', description: 'Un écrin de verdure pour se poser.' },
};

const eventLabels: Record<ActivityEvent['type'], string> = {
  task_created: 'Tâche créée', task_completed: 'Tâche terminée', task_updated: 'Tâche modifiée', task_deleted: 'Tâche supprimée',
  status_changed: 'Statut modifié', subject_created: 'Matière créée', subject_updated: 'Matière modifiée',
  subject_archived: 'Matière archivée', subject_restored: 'Matière restaurée', subject_completed: 'Matière terminée', subject_reopened: 'Matière rouverte',
  note_created: 'Note créée', note_updated: 'Note modifiée', note_deleted: 'Note supprimée',
  flashcard_deck_created: 'Paquet de cartes créé', flashcard_deck_updated: 'Paquet de cartes modifié', flashcard_deck_deleted: 'Paquet de cartes supprimé',
  flashcard_created: 'Carte créée', flashcard_updated: 'Carte modifiée', flashcard_deleted: 'Carte supprimée',
  journal_added: 'Note de travail ajoutée', journal_edited: 'Note de travail modifiée',
  focus_completed: 'Séance terminée', focus_interrupted: 'Séance interrompue', focus_skipped: 'Séance passée',
  plan_created: 'Séance planifiée', plan_updated: 'Séance prévue modifiée', plan_deleted: 'Séance prévue supprimée',
};

export function eventLabel(type: ActivityEvent['type']) {
  return eventLabels[type];
}
