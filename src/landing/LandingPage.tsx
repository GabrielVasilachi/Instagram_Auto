import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  motion,
  MotionConfig,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Film,
  Image,
  Layers3,
  Menu,
  MoreHorizontal,
  Moon,
  Pause,
  Play,
  Plus,
  Sparkles,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import './landing.css';

const studio = '/#overview';
const stages = ['Create', 'Schedule', 'Automate', 'Publish'];
const landingThemeKey = 'instagram-auto-landing-theme';
type LandingTheme = 'dark' | 'light';
function savedLandingTheme(): LandingTheme {
  try {
    return localStorage.getItem(landingThemeKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`ia-mark ${small ? 'ia-mark-small' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
function Label({ children, number }: { children: ReactNode; number?: string }) {
  return (
    <div className="ia-label">
      {number && <span>{number} /</span>}
      {children}
    </div>
  );
}
function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.75, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
function Action({
  children = 'Open your studio',
  light = false,
}: {
  children?: ReactNode;
  light?: boolean;
}) {
  return (
    <a className={`ia-action ${light ? 'ia-action-light' : ''}`} href={studio}>
      <span>{children}</span>
      <ArrowUpRight size={18} />
    </a>
  );
}

// Original vector artwork keeps the product scenes local, lightweight, and independent of media APIs.
function Artwork({ variant = 0, className = '' }: { variant?: number; className?: string }) {
  return (
    <div className={`ia-art ia-art-${variant} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice">
        <circle cx="221" cy="104" r="46" fill="currentColor" opacity=".85" />
        <path d="M-40 314Q72 55 157 237T367 168L350 430H-40Z" fill="currentColor" opacity=".18" />
        <path d="M-40 394Q70 181 176 304T370 250L350 430H-40Z" fill="currentColor" opacity=".38" />
        <path d="M-30 422Q116 283 195 375T367 336L350 450H-30Z" fill="currentColor" opacity=".7" />
        <path
          d="M36 410C54 290 82 245 132 186M74 293Q27 267 39 227Q86 231 85 272M98 242Q84 188 114 159Q147 190 119 216M48 358Q6 333 13 299Q68 310 64 331M110 215Q152 211 171 171Q129 162 110 215M67 321Q114 328 133 284Q86 270 67 321"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity=".65"
        />
      </svg>
      <span className="ia-art-kicker">THE QUIET SERIES / 001</span>
      <strong>
        Make room
        <br />
        for <em>more.</em>
      </strong>
      <span className="ia-art-bottom">
        LESS NOISE. MORE INTENTION. <ArrowUpRight size={12} />
      </span>
    </div>
  );
}

function HeroScene({
  active,
  paused,
  setPaused,
}: {
  active: number;
  paused: boolean;
  setPaused: (value: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    if (reduced || event.pointerType !== 'mouse' || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    ref.current.style.setProperty(
      '--mx',
      `${((event.clientX - box.left) / box.width - 0.5) * 6}deg`,
    );
    ref.current.style.setProperty(
      '--my',
      `${((event.clientY - box.top) / box.height - 0.5) * -5}deg`,
    );
  }
  return (
    <div
      ref={ref}
      className="ia-scene"
      onPointerMove={tilt}
      onPointerLeave={() => {
        ref.current?.style.setProperty('--mx', '0deg');
        ref.current?.style.setProperty('--my', '0deg');
      }}
    >
      <div className="ia-scene-top">
        <span>
          <i /> THE CONTENT ENGINE
        </span>
        <button
          aria-label={paused ? 'Play animation' : 'Pause animation'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
      <div className="ia-orbit ia-orbit-one" />
      <div className="ia-orbit ia-orbit-two" />
      <div className="ia-orbit ia-orbit-three" />
      <div className="ia-scene-depth">
        <svg
          className="ia-connections"
          viewBox="0 0 600 600"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M210 230 C290 230 285 180 390 180 M470 254 C470 312 390 290 390 340 M390 404 C390 440 440 433 440 483" />
          <path
            className="ia-signal"
            d="M210 230 C290 230 285 180 390 180 L470 180 L470 254 C470 312 390 290 390 340 L390 404 C390 440 440 433 440 483"
          />
          <circle cx="292" cy="205" r="3" />
          <circle cx="443" cy="292" r="3" />
        </svg>
        <div className={`ia-source-card ${active === 0 ? 'is-active' : ''}`}>
          <div className="ia-mini-header">
            <span>
              <i /> YOUR NEXT IDEA
            </span>
            <MoreHorizontal size={15} />
          </div>
          <Artwork />
          <div className="ia-source-footer">
            <Film size={13} />
            <span>quiet-moments.mp4</span>
            <span>00:08</span>
          </div>
          <span className="ia-coordinate">01 — CREATE</span>
        </div>
        <div className={`ia-scheduler ${active === 1 ? 'is-active' : ''}`}>
          <div className="ia-mini-header">
            <CalendarDays size={15} />
            <span>Pick your moment</span>
            <Plus size={13} />
          </div>
          <div className="ia-week">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="ia-dates">
            {[21, 22, 23, 24, 25, 26, 27].map((d) => (
              <span className={d === 24 ? 'selected' : ''} key={d}>
                {d}
              </span>
            ))}
          </div>
          <div className="ia-schedule-time">
            <Clock3 size={12} />
            <span>Today, 09:00</span>
            <Check size={13} />
          </div>
          <span className="ia-coordinate">02 — SCHEDULE</span>
        </div>
        <div className={`ia-engine ${active === 2 ? 'is-active' : ''}`}>
          <div className="ia-engine-ring" />
          <Mark />
          <span>AUTO</span>
        </div>
        <div className={`ia-published ${active === 3 ? 'is-active' : ''}`}>
          <span className="ia-success-icon">
            <Check size={16} />
          </span>
          <div>
            <strong>And… you’re live.</strong>
            <span>Published to Instagram</span>
          </div>
          <span className="ia-published-dot" />
        </div>
        <div className="ia-scene-note">
          <span className="ia-note-line" /> A little less doing.
          <br />A lot more done.
        </div>
      </div>
      <div className="ia-scene-bottom">
        <span>ONE IDEA. ALWAYS MOVING.</span>
        <span>↗ AUTO PILOT</span>
      </div>
    </div>
  );
}

function ProductPreview() {
  const [tab, setTab] = useState('queue');
  const tabs = [
    { id: 'queue', label: 'Content queue', icon: Layers3 },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
  ];
  return (
    <div className="ia-product-window">
      <div className="ia-window-bar">
        <div className="ia-window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>YOUR STUDIO / EVERYTHING IN ITS PLACE</span>
        <span className="ia-demo-label">Interactive preview</span>
      </div>
      <div className="ia-product-shell">
        <aside className="ia-product-sidebar">
          <div className="ia-preview-brand">
            <Mark small />
            <span>
              SilentForward<small>CONTENT STUDIO</small>
            </span>
          </div>
          <span className="ia-sidebar-caption">WORKSPACE</span>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? 'is-selected' : ''}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              <Icon size={15} />
              {label}
              {tab === id && <span className="ia-nav-dot" />}
            </button>
          ))}
          <div className="ia-sidebar-bottom">
            <span className="ia-avatar">SF</span>
            <span>
              Your workspace<small>Instagram Business</small>
            </span>
          </div>
        </aside>
        <div className="ia-product-main">
          <div className="ia-product-title">
            <div>
              <span className="ia-label">A CLEARER PICTURE</span>
              <h3>
                {tab === 'queue'
                  ? 'Good things, lined up.'
                  : tab === 'calendar'
                    ? 'A rhythm you can see.'
                    : 'Know what connects.'}
              </h3>
            </div>
            <a href="/#studio" className="ia-preview-cta">
              <Plus size={14} />
              <span>Create content</span>
            </a>
          </div>
          <div className="ia-product-stats">
            {[
              ['12', 'Scheduled', 'mint'],
              ['28', 'Published', 'white'],
              ['0', 'Needs attention', 'white'],
            ].map(([n, label, color]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className={color === 'mint' ? 'ia-mint' : ''}>
                  {n}
                  <small>
                    {label === 'Scheduled'
                      ? 'Ready when you are'
                      : label === 'Published'
                        ? 'Out in the world'
                        : 'All looking good'}
                  </small>
                </strong>
              </div>
            ))}
          </div>
          <div className="ia-mobile-tabs">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'queue' && (
            <div className="ia-queue">
              <div className="ia-queue-heading">
                <strong>Up next</strong>
                <span>
                  <span className="ia-status-dot" /> Publishing automatically
                </span>
              </div>
              <div className="ia-preview-cards">
                {[
                  'A slower kind of morning.',
                  'Small steps. Real progress.',
                  'Find your own rhythm.',
                ].map((title, i) => (
                  <div className="ia-preview-card" key={title}>
                    <Artwork variant={i} />
                    <div className="ia-preview-card-details">
                      <span>
                        <Film size={11} />
                        {i === 1 ? 'POST' : 'REEL'}
                        <span className="ia-card-status">Scheduled</span>
                      </span>
                      <strong>{title}</strong>
                      <small>
                        <Clock3 size={11} />
                        Today · {['09:00', '13:00', '18:00'][i]}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'calendar' && (
            <div className="ia-calendar-preview">
              <div className="ia-queue-heading">
                <strong>September 2026</strong>
                <span>Your publishing rhythm</span>
              </div>
              <div className="ia-calendar-grid">
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
                  <span className="ia-calendar-day" key={d}>
                    {d}
                  </span>
                ))}
                {Array.from({ length: 21 }, (_, i) => (
                  <div className={i === 10 ? 'ia-today' : ''} key={i}>
                    <span>{i + 14 > 30 ? i - 16 : i + 14}</span>
                    {[1, 3, 7, 10, 12, 15, 17].includes(i) && (
                      <small>
                        <i />
                        {i % 2 ? 'Reel' : 'Post'}
                        <b>09:00</b>
                      </small>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'insights' && (
            <div className="ia-insights-preview">
              <div className="ia-queue-heading">
                <strong>Content performance</strong>
                <span>Illustrative data · Last 7 days</span>
              </div>
              <div
                className="ia-chart"
                role="img"
                aria-label="Example weekly reach chart showing increasing content reach"
              >
                {[30, 48, 41, 67, 57, 83, 96].map((h, i) => (
                  <div key={i}>
                    <span style={{ height: `${h}%` }} />
                    <small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</small>
                  </div>
                ))}
              </div>
              <div className="ia-insight-tags">
                <span>Views</span>
                <span>Reach</span>
                <span>Shares</span>
                <span>Saves</span>
              </div>
            </div>
          )}
          <div className="ia-preview-footnote">
            <span>
              <CircleCheck size={12} /> Your plan. Your pace. One workspace.
            </span>
            <span>Sample content & data</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const workflow = [
  {
    title: 'Make something worth sharing.',
    short: 'Create',
    text: 'Bring your media into the studio. Shape your post or Reel with the editor, captions, and your own visual style.',
    icon: Sparkles,
  },
  {
    title: 'Give it a time. Get yours back.',
    short: 'Schedule',
    text: 'Choose your publishing times and timezone. See the whole plan in your content queue and calendar.',
    icon: CalendarDays,
  },
  {
    title: 'Let the background do the work.',
    short: 'Automate',
    text: 'With your account and publishing service configured, your scheduled content moves forward automatically.',
    icon: Zap,
  },
  {
    title: 'Out in the world. Still in view.',
    short: 'Publish',
    text: 'Follow publishing status, spot anything that needs attention, and see how your content performs.',
    icon: CircleCheck,
  },
];

function Workflow() {
  const [active, setActive] = useState(0);
  const StepIcon = workflow[active].icon;
  return (
    <section className="ia-workflow ia-section" id="how-it-works">
      <div className="ia-workflow-intro">
        <Reveal>
          <Label number="03">FROM IDEA TO INSTAGRAM</Label>
          <h2>
            A good flow.
            <br />
            Without the
            <br />
            <em>back and forth.</em>
          </h2>
          <p>
            Four steps. One continuous motion.
            <br />
            You set the direction. We keep it moving.
          </p>
        </Reveal>
        <div className="ia-flow-display" aria-hidden="true">
          <div className="ia-flow-track">
            {workflow.map(({ icon: Icon }, i) => (
              <div key={i} className={i <= active ? 'is-active' : ''}>
                <Icon size={20} />
              </div>
            ))}
          </div>
          <div className="ia-flow-result" key={active}>
            <StepIcon size={32} />
            <span>
              0{active + 1} / {workflow[active].short.toUpperCase()}
            </span>
            <strong>
              {
                [
                  'An idea takes shape.',
                  'A moment, reserved.',
                  'Consider it handled.',
                  'Hello, Instagram.',
                ][active]
              }
            </strong>
            {active === 3 && (
              <span className="ia-flow-check">
                <Check size={13} /> Published
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="ia-workflow-steps">
        {workflow.map((step, i) => (
          <motion.article
            key={step.short}
            onViewportEnter={() => setActive(i)}
            viewport={{ margin: '-32% 0px -32% 0px' }}
            className={active === i ? 'is-active' : ''}
          >
            <button onClick={() => setActive(i)} aria-pressed={active === i}>
              <span className="ia-step-number">0{i + 1}</span>
              <span>{step.short}</span>
              <step.icon size={20} />
            </button>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            <span className="ia-step-line" />
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [theme, setTheme] = useState<LandingTheme>(savedLandingTheme);
  useEffect(() => {
    try {
      localStorage.setItem(landingThemeKey, theme);
    } catch {
      // Theme switching remains available when browser storage is disabled.
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const previous = themeColor?.getAttribute('content');
    themeColor?.setAttribute('content', theme === 'light' ? '#fafbf8' : '#101211');
    return () => {
      if (previous != null) themeColor?.setAttribute('content', previous);
    };
  }, [theme]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const heroVisible = useInView(heroRef, { amount: 0.15 });
  const reduced = useReducedMotion();
  const { scrollYProgress, scrollY } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  const heroY = useTransform(scrollY, [0, 850], [0, reduced ? 0 : 65]);
  useEffect(() => {
    const oldTitle = document.title;
    const oldLang = document.documentElement.lang;
    const description = document.querySelector('meta[name="description"]');
    const oldDescription = description?.getAttribute('content') || '';
    document.title = 'Instagram Auto — Your content. Already out there.';
    document.documentElement.lang = 'en';
    description?.setAttribute(
      'content',
      'Create, schedule, and automatically publish Instagram posts and Reels. Your content keeps moving, even when you step away.',
    );
    return () => {
      document.title = oldTitle;
      document.documentElement.lang = oldLang;
      description?.setAttribute('content', oldDescription);
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || !heroVisible) return;
    const timer = window.setInterval(() => setActive((s) => (s + 1) % 4), 2600);
    return () => window.clearInterval(timer);
  }, [paused, reduced, heroVisible]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);
  return (
    <MotionConfig reducedMotion="user">
      <div
        data-landing-theme={theme}
        className={`ia-landing ${paused || reduced || !heroVisible ? 'ia-motion-paused' : ''}`}
      >
        <a href="#main" className="ia-skip">
          Skip to content
        </a>
        <motion.div className="ia-scroll-progress" style={{ scaleX: progress }} />
        <header className="ia-header">
          <a href="/" className="ia-brand" aria-label="Instagram Auto home">
            <Mark />
            <span>
              instagram<span className="ia-brand-auto">auto</span>
            </span>
          </a>
          <nav
            className={menuOpen ? 'is-open' : ''}
            aria-label="Main navigation"
            id="ia-navigation"
          >
            {[
              ['Product', '#product'],
              ['How it works', '#how-it-works'],
              ['Features', '#features'],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
            <a className="ia-mobile-studio" href={studio}>
              Open studio <ArrowUpRight size={14} />
            </a>
          </nav>
          <div className="ia-header-actions">
            <button
              type="button"
              className="ia-theme-toggle"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <a className="ia-nav-cta" href={studio}>
              Open studio <ArrowUpRight size={15} />
            </a>
            <button
              className="ia-menu-toggle"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-controls="ia-navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </header>
        <main id="main">
          <section className="ia-hero" ref={heroRef}>
            <div className="ia-hero-grid" />
            <div className="ia-hero-topline">
              <span>
                <i className="ia-status-dot" /> YOUR INSTAGRAM. IN MOTION.
              </span>
              <span>DESIGNED FOR A LITTLE MORE LIFE ↗</span>
            </div>
            <div className="ia-hero-composition">
              <motion.div className="ia-hero-copy" style={{ y: heroY }}>
                <Reveal>
                  <div className="ia-hero-tag">
                    <span>AUTOMATE THE EVERYDAY</span>
                    <ArrowUpRight size={12} />
                  </div>
                  <h1>
                    Your content.
                    <br />
                    Already
                    <br />
                    <em>out there.</em>
                    <span className="ia-title-spark" aria-hidden="true">
                      ✳
                    </span>
                  </h1>
                  <p>
                    Create it. Schedule it. Let it go.
                    <br />
                    Instagram publishing that keeps moving,
                    <br className="ia-desktop-br" /> even when you don’t.
                  </p>
                  <div className="ia-hero-actions">
                    <Action>Start automating</Action>
                    <a className="ia-text-action" href="#how-it-works">
                      <span className="ia-play-icon">
                        <Play size={11} fill="currentColor" />
                      </span>
                      See the flow
                    </a>
                  </div>
                  <div className="ia-hero-caption">
                    <span className="ia-tiny-line" /> LESS ON YOUR TO-DO. MORE IN YOUR FEED.
                  </div>
                </Reveal>
              </motion.div>
              <motion.div
                className="ia-hero-visual"
                initial={reduced ? false : { opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.2 }}
              >
                <HeroScene active={active} paused={paused} setPaused={setPaused} />
              </motion.div>
            </div>
            <div className="ia-hero-footer">
              <a href="#less-work" className="ia-scroll-hint">
                <ArrowDown size={15} />
                SCROLL TO FIND YOUR FLOW
              </a>
              <div className="ia-stage-strip" aria-label="Automation preview stages">
                {stages.map((stage, i) => (
                  <button
                    key={stage}
                    onClick={() => {
                      setActive(i);
                      setPaused(true);
                    }}
                    aria-pressed={active === i}
                    className={active === i ? 'is-active' : ''}
                  >
                    <span>0{i + 1}</span>
                    {stage}
                    {i < 3 && <ChevronRight size={13} />}
                  </button>
                ))}
              </div>
              <span className="ia-hero-index">01 — 04</span>
            </div>
          </section>
          <div className="ia-format-strip">
            <span>
              ONE WORKSPACE.
              <br />
              <strong>YOUR WHOLE RHYTHM.</strong>
            </span>
            <span>
              <Image size={18} />
              Posts
            </span>
            <span>
              <Film size={18} />
              Reels
            </span>
            <span>
              <Layers3 size={18} />
              Stories
            </span>
            <span>
              <CalendarDays size={18} />
              Scheduling
            </span>
            <span>
              <BarChart3 size={18} />
              Insights
            </span>
          </div>
          <section className="ia-comparison ia-section" id="less-work">
            <Reveal className="ia-comparison-title">
              <Label number="01">TAKE YOUR TIME BACK</Label>
              <h2>
                Your content shouldn’t
                <br />
                depend on you
                <br />
                <em>being online.</em>
              </h2>
              <p>
                The idea deserves your attention.
                <br />
                The routine doesn’t.
              </p>
            </Reveal>
            <Reveal className="ia-comparison-map" delay={0.15}>
              <div className="ia-manual-label">
                <span>THE OLD ROUTINE</span>
                <span>Every. Single. Time.</span>
              </div>
              <div className="ia-manual-flow">
                {[
                  'Create',
                  'Remember',
                  'Open Instagram',
                  'Upload',
                  'Add caption',
                  'Publish',
                  'Repeat',
                ].map((s, i) => (
                  <span key={s}>
                    {s}
                    {i < 6 && <ArrowRight size={12} />}
                  </span>
                ))}
              </div>
              <div className="ia-flow-divider">
                <span />
                <ArrowDown size={18} />
                <span />
              </div>
              <div className="ia-auto-label">
                <Mark small />
                <span>THE INSTAGRAM AUTO WAY</span>
              </div>
              <div className="ia-simple-flow">
                <span>Create</span>
                <ArrowRight size={21} />
                <span>Schedule</span>
                <ArrowRight size={21} />
                <strong>
                  Done.
                  <Check size={18} />
                </strong>
              </div>
              <div className="ia-comparison-note">
                <span className="ia-status-dot" /> A consistent presence. A lighter headspace.
              </div>
            </Reveal>
          </section>
          <section className="ia-product ia-section" id="product">
            <Reveal className="ia-section-heading">
              <div>
                <Label number="02">THE BIG PICTURE</Label>
                <h2>
                  A home for your content.
                  <br />
                  <em>Space for your head.</em>
                </h2>
              </div>
              <p>
                From the next idea to the last published post.
                <br />
                Everything connected. Everything in view.
              </p>
            </Reveal>
            <Reveal className="ia-product-reveal">
              <div className="ia-product-glow" />
              <ProductPreview />
            </Reveal>
            <div className="ia-feature-line" id="features">
              {[
                {
                  icon: CalendarDays,
                  title: 'Find your rhythm.',
                  copy: 'Plan ahead with a visual calendar and publishing times that work for you.',
                },
                {
                  icon: Film,
                  title: 'More than a post.',
                  copy: 'Create posts and Reels, manage your media, and keep your visual style consistent.',
                },
                {
                  icon: CircleCheck,
                  title: 'Stay in the know.',
                  copy: 'See what’s scheduled, published, or needs attention. No second-guessing.',
                },
              ].map(({ icon: Icon, title, copy }, i) => (
                <Reveal key={title} delay={i * 0.08}>
                  <Icon size={20} />
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <span className="ia-feature-index">0{i + 1}</span>
                </Reveal>
              ))}
            </div>
          </section>
          <Workflow />
          <section className="ia-offline" aria-labelledby="ia-offline-title">
            <div className="ia-offline-grid" />
            <div className="ia-offline-inner">
              <Reveal>
                <Label number="04">STEP AWAY. STAY PRESENT.</Label>
                <h2 id="ia-offline-title">
                  You don’t need
                  <br />
                  to be online
                  <br />
                  for your <em>content to be.</em>
                </h2>
                <p>
                  Morning coffee. Deep work. A little time outside.
                  <br />
                  Your schedule keeps its promises.
                </p>
                <span className="ia-offline-note">
                  <span className="ia-status-dot" /> AUTOMATIC PUBLISHING, ON YOUR SCHEDULE
                </span>
              </Reveal>
              <div className="ia-day-timeline">
                {[
                  ['09:00', 'You take it slow.', 'Your morning Reel goes live.', 0],
                  ['13:00', 'You find your focus.', 'Your next post is published.', 1],
                  ['18:00', 'You call it a day.', 'Your evening Reel takes over.', 2],
                ].map(([time, title, detail, variant], i) => (
                  <Reveal className="ia-day-event" key={time} delay={i * 0.12}>
                    <time>{time}</time>
                    <div className="ia-day-dot">
                      <Check size={12} />
                    </div>
                    <div className="ia-day-event-copy">
                      <strong>{title}</strong>
                      <span>{detail}</span>
                    </div>
                    <Artwork variant={Number(variant)} className="ia-day-thumb" />
                  </Reveal>
                ))}
                <span className="ia-day-caption">An example day with publishing configured.</span>
              </div>
            </div>
          </section>
          <section className="ia-final ia-section">
            <Reveal>
              <Label>LESS ROUTINE. MORE ROOM.</Label>
              <h2>
                Make your next move.
                <br />
                <em>Then leave it to Auto.</em>
              </h2>
              <Action light>Open your studio</Action>
              <p>Your ideas. Your timing. A little less on your plate.</p>
            </Reveal>
            <span className="ia-final-orbit" aria-hidden="true" />
          </section>
        </main>
        <footer className="ia-footer">
          <a href="/" className="ia-brand">
            <Mark small />
            <span>
              instagram<span className="ia-brand-auto">auto</span>
            </span>
          </a>
          <span>Made for a more consistent you.</span>
          <a href="#main">
            Back to top <ArrowUpRight size={14} />
          </a>
          <small>Independent product. Not affiliated with Instagram or Meta.</small>
          <p className="ia-footer-credit">
            Made with{' '}
            <span role="img" aria-label="love">
              ♥
            </span>{' '}
            by{' '}
            <a href="https://gabrielvasilachi.com" target="_blank" rel="noopener noreferrer">
              Gabi
            </a>
          </p>
        </footer>
      </div>
    </MotionConfig>
  );
}
