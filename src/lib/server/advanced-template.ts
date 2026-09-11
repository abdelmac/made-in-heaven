import 'server-only';

export const SOFTWARE_DEVELOPMENT_TEMPLATE = {
  id: 'software-development' as const,
  title: 'Software development',
  description: '## Acceptance criteria\n\n- \n\n## Implementation notes\n\n## Repository\n\n',
  checklist: [
    'Clarify acceptance criteria',
    'Implement the change',
    'Add meaningful tests',
    'Run checks',
    'Review the result',
  ].map((text) => ({ text, done: false as const })),
  resources: [],
};
