import 'server-only';

export const SOFTWARE_DEVELOPMENT_TEMPLATE = {
  id: 'software-development' as const,
  title: 'Développement logiciel',
  description: "## Critères d'acceptation\n\n- \n\n## Notes de réalisation\n\n## Dépôt\n\n",
  checklist: [
    "Clarifier les critères d'acceptation",
    'Réaliser la modification',
    'Ajouter des tests pertinents',
    'Exécuter les vérifications',
    'Examiner le résultat',
  ].map((text) => ({ text, done: false as const })),
  resources: [],
};
