import type { PlanLimits } from '@/lib/billing/config';

/** Payment and plan comparison copy. Amounts always come from the configured Stripe Prices. */
export const billingCopy = {
  freeDescription: 'The essentials, with colors that feel like you.',
  proDescription: 'Build your study space. Make what you learn stick.',
  teamDescription: 'Bring your shared work into one space.',
  features: {
    free: [
      'Pomodoro timer, tasks & weekly planner',
      '8 classic color palettes + your own accent color',
      'Note sheets for your study material',
      'Basic history & analytics',
      'Portable data export',
    ],
    pro: [
      'Everything in Free for your personal workspace',
      '4 gradient backgrounds + your own image',
      'Background dimming & blur controls',
      'Flashcard decks with study sessions',
      'Full custom themes & saved dashboard layouts',
      'Advanced analytics & task templates',
    ],
    team: [
      'Everything in Pro for one organization',
      'Shared projects & task assignments',
      'Invitations & owner, admin, member, viewer roles',
      'Workspace defaults for your team',
      'Team analytics within your permissions',
    ],
  },
  customizeFree: 'Personalize your colors',
  signIn: 'Sign in to upgrade',
  signInHint: 'Paid plans need an account so your purchase stays with your workspace.',
  billingUnavailable:
    'Payments are not available yet. You can keep using Free and personalizing your colors.',
  unavailableAction: 'Payments unavailable',
  intervalUnavailable: 'This billing interval is not available.',
  portalUnavailable:
    'Subscription management is temporarily unavailable. Please contact your workspace provider.',
  switchPersonal: 'Choose a personal workspace',
  switchOrganization: 'Choose an organization',
  workspaceHint: 'Choose or create the matching workspace before upgrading.',
  localHint: 'Choose a cloud workspace from the workspace menu to connect a plan to your account.',
  ownerOnly: 'Only the workspace owner can change this plan.',
  retry: 'Check availability again',
  choosePro: 'Get Pro',
  chooseTeam: 'Get Team',
  perMonth: '/ month',
  perYear: '/ year',
  billedAnnually: 'Billed annually. The amount shown covers a full year.',
  billedMonthly: 'Billed monthly.',
  cancelHint: 'Manage renewal, cancellation, payment methods and invoices in Stripe.',
  processing: 'Checking your payment. Paid features unlock after Stripe confirms it.',
  activated: 'Your paid plan is active for this workspace.',
  refresh: 'Refresh plan',
  testHint: 'Test checkout uses Stripe test cards and does not charge real money.',
  usageDefaults: (limits: PlanLimits) =>
    `Default Free limits: ${limits.subjects ?? 'unlimited'} subjects, ${limits.tasks ?? 'unlimited'} tasks and ${limits.projects ?? 'unlimited'} projects. Your workspace provider can adjust these limits.`,
  scope:
    'Pro belongs to your personal workspace. Team covers one organization; personal workspaces remain separate.',
} as const;
