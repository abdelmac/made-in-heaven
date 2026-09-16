export const activityRange = {
  period: 'Activity period',
  year: '52 weeks',
  month: 'Month',
  monthInput: 'Activity month',
  previous: 'Previous month',
  next: 'Next month',
  current: 'This month',
  monthSubtitle: 'A closer look at your completed focus, one day at a time.',
  focused: 'focused',
  monthTotal: (month: string) => `completed sessions in ${month}`,
  calendarLabel: (month: string) => `${month} activity`,
  scope: (from?: string, to?: string) =>
    from && to
      ? `Activity filtered from ${from} to ${to}.`
      : from
        ? `Activity filtered from ${from}.`
        : `Activity filtered through ${to}.`,
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
