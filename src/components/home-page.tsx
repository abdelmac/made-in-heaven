/* Native navigation lets the shared root shell select the home or workspace from
   the destination URL, including when the shell is served offline. */
/* eslint-disable @next/next/no-html-link-for-pages */
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  Coffee,
  Leaf,
  Smile,
  Timer,
} from 'lucide-react';
import { HomeTimer } from './home-timer';
import { SolaceMark } from './solace-mark';
import styles from './home-page.module.css';

const steps = [
  {
    Icon: CheckCheck,
    title: 'Choisissez une seule chose.',
    description:
      'Un chapitre à réviser, une idée à écrire, une tâche à terminer. Un petit objectif suffit pour commencer.',
  },
  {
    Icon: Timer,
    title: 'Faites-lui de la place.',
    description:
      'Lancez 25 minutes de concentration. Mettez les distractions de côté et avancez à votre rythme.',
  },
  {
    Icon: Coffee,
    title: 'Prenez une vraie pause.',
    description:
      'Accordez-vous 5 minutes pour respirer, bouger ou boire un verre d’eau. Puis recommencez si vous le souhaitez.',
  },
];

const features = [
  {
    Icon: CalendarDays,
    title: 'Une journée plus claire',
    description: 'Organisez vos tâches et placez vos séances dans le calendrier.',
    href: '/?view=planner',
    link: 'Découvrir le planning',
  },
  {
    Icon: BookOpen,
    title: 'Vos idées, au même endroit',
    description: 'Rassemblez vos matières, vos projets et vos notes pour garder le fil.',
    href: '/?view=notes',
    link: 'Découvrir les notes',
  },
  {
    Icon: Leaf,
    title: 'Des progrès qui se voient',
    description: 'Retrouvez vos séances terminées et votre activité au fil des jours.',
    href: '/?view=analytics',
    link: 'Découvrir le bilan',
  },
  {
    Icon: Smile,
    title: 'De la place pour vous',
    description: 'Notez votre humeur et votre énergie avec un petit point quotidien privé.',
    href: '/?view=mood',
    link: 'Découvrir le suivi d’humeur',
  },
];

export function HomePage() {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#accueil-contenu">
        Aller au contenu
      </a>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="Solace — accueil">
          <SolaceMark size={37} />
          <span>solace</span>
        </a>
        <nav className={styles.navigation} aria-label="Navigation de l’accueil">
          <a className={styles.sectionLink} href="#comment-ca-marche">
            Comment ça marche
          </a>
          <a className={styles.sectionLink} href="#votre-espace">
            Votre espace
          </a>
          <a className={styles.headerAction} href="/?view=overview">
            Ouvrir mon espace <ArrowRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main id="accueil-contenu" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.littleStar} aria-hidden="true">
                ✦
              </span>
              Faites place à la concentration
            </p>
            <h1 id="home-title">
              Un peu de calme.
              <br />
              <em>Un pas de plus.</em>
            </h1>
            <p className={styles.introduction}>
              Solace, c’est votre espace pour vous concentrer, organiser vos journées et prendre
              soin de votre rythme. Commencez simplement, un moment à la fois.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryLink} href="#essayer">
                Essayer le minuteur <ArrowDown size={17} aria-hidden="true" />
              </a>
              <a className={styles.textLink} href="/?view=overview">
                Organiser ma journée <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            <p className={styles.reassurance}>
              <Check size={15} aria-hidden="true" /> Sans compte pour commencer. À votre rythme.
            </p>
          </div>
          <div id="essayer" className={styles.timerArea}>
            <div className={styles.orbit} aria-hidden="true" />
            <HomeTimer />
            <p className={styles.timerCaption}>Vous n’avez qu’une chose à faire : commencer.</p>
          </div>
        </section>

        <section id="comment-ca-marche" className={styles.howSection} aria-labelledby="how-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Le principe est simple</p>
              <h2 id="how-title">Un temps pour avancer. Un temps pour souffler.</h2>
            </div>
            <p>
              La méthode Pomodoro alterne concentration et pauses. Pas besoin de tout faire
              aujourd’hui : commencez par une séance.
            </p>
          </div>
          <ol className={styles.steps}>
            {steps.map(({ Icon, title, description }, index) => (
              <li key={title} className={styles.step}>
                <div className={styles.stepTop}>
                  <span className={styles.icon}>
                    <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span className={styles.stepNumber} aria-hidden="true">
                    0{index + 1}
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="votre-espace"
          className={styles.workspaceSection}
          aria-labelledby="space-title"
        >
          <div className={styles.workspaceIntro}>
            <span className={styles.largeMark} aria-hidden="true">
              <SolaceMark size={56} />
            </span>
            <p className={styles.eyebrow}>Bien plus qu’un minuteur</p>
            <h2 id="space-title">
              Moins de choses en tête.
              <br />
              <em>Plus de place pour l’essentiel.</em>
            </h2>
            <p>
              Quand vous êtes prêt, retrouvez tout dans votre espace : ce que vous voulez faire, ce
              que vous avez appris et le chemin déjà parcouru.
            </p>
            <a className={styles.primaryLink} href="/?view=overview">
              Entrer dans mon espace <ArrowRight size={17} aria-hidden="true" />
            </a>
            <small>Commencez avec un exemple ou créez votre premier objectif.</small>
          </div>
          <div className={styles.features}>
            {features.map(({ Icon, title, description, href, link }) => (
              <article className={styles.feature} key={title}>
                <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
                <a href={href}>
                  {link}
                  <ArrowRight size={15} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.faqSection} aria-labelledby="faq-title">
          <div>
            <p className={styles.eyebrow}>Avant de commencer</p>
            <h2 id="faq-title">Quelques repères.</h2>
            <p>Un espace simple, que vous prenez en main à votre rythme.</p>
          </div>
          <div className={styles.questions}>
            <details>
              <summary>Est-ce que je dois créer un compte ?</summary>
              <p>
                Vous pouvez essayer le minuteur et utiliser un espace local sans compte. Les données
                de cet espace sont enregistrées dans votre navigateur, sur cet appareil. Vous pouvez
                les exporter depuis les réglages pour en garder une copie.
              </p>
            </details>
            <details>
              <summary>Le minuteur d’accueil compte-t-il dans mon bilan ?</summary>
              <p>
                Le minuteur d’accueil sert à essayer une séance libre. Pour retrouver votre temps de
                concentration dans le bilan et le relier à une tâche, lancez vos séances depuis
                votre espace. Seules les séances de concentration terminées y sont comptées.
              </p>
            </details>
            <details>
              <summary>Par où commencer dans mon espace ?</summary>
              <p>
                Explorez l’exemple proposé ou choisissez de repartir de zéro. Ajoutez une matière ou
                un objectif, créez votre première tâche, puis réservez-lui un moment dans le
                planning. Le minuteur vous accompagne pour passer à l’action.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <a href="/" className={styles.brand} aria-label="Solace — accueil">
            <SolaceMark size={29} />
            <span>solace</span>
          </a>
          <span>Un peu de concentration, chaque jour.</span>
        </div>
        <nav aria-label="Informations sur Solace">
          <a href="/support">Aide</a>
          <a href="/privacy">Confidentialité</a>
          <a href="/terms">Conditions</a>
          <a href="/legal">Mentions légales</a>
        </nav>
      </footer>
    </div>
  );
}
