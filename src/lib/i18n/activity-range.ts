export const activityRange = {
  period: 'Période d’activité',
  year: '52 semaines',
  month: '1 mois',
  monthInput: 'Mois d’activité',
  previous: 'Mois précédent',
  next: 'Mois suivant',
  current: 'Ce mois-ci',
  monthSubtitle: 'Vos séances terminées, un jour à la fois.',
  focused: 'de concentration',
  monthTotal: (month: string) => `séances terminées en ${month}`,
  calendarLabel: (month: string) => `Activité de ${month}`,
  scope: (from?: string, to?: string) =>
    from && to
      ? `Activité du ${from} au ${to}.`
      : from
        ? `Activité à partir du ${from}.`
        : `Activité jusqu’au ${to}.`,
  weekdays: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
};
