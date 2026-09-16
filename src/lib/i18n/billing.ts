import type { PlanLimits } from '@/lib/billing/config';

/** French plan copy. Amounts always come from the configured Stripe Prices. */
export const billingCopy = {
  freeDescription: 'L’essentiel, avec des couleurs qui vous ressemblent.',
  proDescription: 'Créez votre espace d’apprentissage. Mémorisez vos découvertes.',
  teamDescription: 'Rassemblez votre travail d’équipe dans un espace commun.',
  features: {
    free: [
      'Minuteur Pomodoro, tâches et planning hebdomadaire',
      '8 palettes classiques et votre couleur d’accent',
      'Fiches de notes pour vos cours et projets',
      'Historique et statistiques de base',
      'Export de vos données',
    ],
    pro: [
      'Toute l’offre gratuite pour votre espace personnel',
      '4 arrière-plans en dégradé et votre propre image',
      'Réglages de luminosité et de flou de l’arrière-plan',
      'Paquets de cartes mémoire avec révisions',
      'Thèmes personnalisés et dispositions enregistrées',
      'Statistiques avancées et modèles de tâches',
    ],
    team: [
      'Toute l’offre Pro pour une organisation',
      'Projets partagés et attribution des tâches',
      'Invitations et rôles : propriétaire, administrateur, membre, lecteur',
      'Réglages communs pour votre équipe',
      'Statistiques d’équipe selon vos droits',
    ],
  },
  customizeFree: 'Personnaliser vos couleurs', signIn: 'Se connecter pour changer d’offre',
  signInHint: 'Un compte est nécessaire pour associer votre achat à votre espace.',
  billingUnavailable: 'Les paiements ne sont pas encore disponibles. Vous pouvez continuer avec l’offre gratuite et personnaliser vos couleurs.',
  unavailableAction: 'Paiements indisponibles', intervalUnavailable: 'Cette périodicité n’est pas disponible.',
  portalUnavailable: 'La gestion des abonnements est temporairement indisponible. Contactez le responsable de votre espace.',
  switchPersonal: 'Choisir un espace personnel', switchOrganization: 'Choisir une organisation',
  workspaceHint: 'Choisissez ou créez l’espace correspondant avant de changer d’offre.',
  localHint: 'Choisissez un espace connecté dans le menu des espaces pour associer une offre à votre compte.',
  ownerOnly: 'Seul le propriétaire de cet espace peut changer l’offre.', retry: 'Vérifier à nouveau la disponibilité',
  choosePro: 'Choisir Pro', chooseTeam: 'Choisir Team', perMonth: '/ mois', perYear: '/ an',
  billedAnnually: 'Facturation annuelle. Le montant affiché couvre une année entière.', billedMonthly: 'Facturation mensuelle.',
  cancelHint: 'Gérez le renouvellement, la résiliation, les moyens de paiement et les factures dans Stripe.',
  processing: 'Vérification du paiement. Les fonctionnalités payantes seront activées après confirmation de Stripe.',
  activated: 'Votre offre payante est active dans cet espace.', refresh: 'Actualiser l’offre',
  testHint: 'Le paiement de test utilise les cartes de test Stripe et ne prélève pas d’argent réel.',
  usageDefaults: (limits: PlanLimits) =>
    `Limites gratuites par défaut : ${limits.subjects ?? 'un nombre illimité de'} matières, ${limits.tasks ?? 'un nombre illimité de'} tâches et ${limits.projects ?? 'un nombre illimité de'} projets. Le responsable du service peut ajuster ces limites.`,
  scope: 'Pro est associé à votre espace personnel. Team couvre une organisation ; les espaces personnels restent séparés.',
} as const;
