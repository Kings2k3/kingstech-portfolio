/* =========================================================
   kingsTech — CORE APPLICATION JAVASCRIPT
   Modern Interactive Controls, Liquid Glass Hook, Theme Studio,
   Magnetic Cursor, and Dynamic Roadmap Engine.
========================================================= */

/* =========================================================
   01. GLOBAL DOM REFERENCES
========================================================= */
const root = document.documentElement;
const body = document.body;
const nav = document.getElementById('siteNav');
const studio = document.getElementById('themeStudio');
const studioToggle = document.getElementById('studioToggle');
const studioClose = document.getElementById('studioClose');
const themeToggle = document.getElementById('themeToggle');
const mobileToggle = document.getElementById('mobileToggle');
const mobileDrawer = document.getElementById('mobileDrawer');
const systemQuery = window.matchMedia('(prefers-color-scheme: light)');
const THEME_PREFERENCE_KEY = 'kingstech:theme-preference';

let themePreference = (() => {
  const bootPreference = root.dataset.themePreference || window.__KINGS_THEME_PREF || window.__RAY_THEME_PREF;
  if (bootPreference === 'dark' || bootPreference === 'light' || bootPreference === 'system') return bootPreference;
  try {
    const stored = localStorage.getItem(THEME_PREFERENCE_KEY) || localStorage.getItem('raynerdtech:theme-preference');
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch (_) {}
  return 'system';
})();

let appearanceFrame = 0;
let appearanceSettleFrame = 0;
let appearanceSettleTimer = 0;
let appearanceSequence = 0;
let themeSwitchTimer = 0;

const DARK_BACKGROUNDS = new Set(['black', 'charcoal', 'espresso', 'slate']);
const LIGHT_BACKGROUNDS = new Set(['paper', 'porcelain', 'warm']);
let darkBackgroundPreference = DARK_BACKGROUNDS.has(root.dataset.background) ? root.dataset.background : 'black';
let lightBackgroundPreference = LIGHT_BACKGROUNDS.has(root.dataset.background) ? root.dataset.background : 'paper';

// Project links belong to the content layer.
document.querySelectorAll('.project-cta').forEach((action) => {
  action.removeAttribute('data-liquid-glass');
  action.removeAttribute('data-liquid-variant');
  action.removeAttribute('data-liquid-tint');
  action.removeAttribute('data-liquid-mode');
  action.removeAttribute('data-liquid-rendered');
});

// Set optical strength per component
[
  ['.portrait-status', 1.18],
  ['#themeStudio, #mobileDrawer', 1.00],
  ['.nav-inner', 1.00],
  ['.icon-btn, .mobile-toggle, .service-action, .contact-arrow', 1.04],
  ['.hero-actions [data-liquid-glass], .contact-panel .hero-actions [data-liquid-glass]', 1.06],
  ['.rm-node-inner, .rm-m-dot', 0.94],
  ['.fit-tabs', 1.00],
].forEach(([selector, strength]) => {
  document.querySelectorAll(selector).forEach((surface) => {
    surface.dataset.liquidStrength = String(strength);
  });
});

function signalAppearanceChange(reason = 'appearance') {
  if (appearanceFrame) cancelAnimationFrame(appearanceFrame);
  if (appearanceSettleFrame) cancelAnimationFrame(appearanceSettleFrame);
  if (appearanceSettleTimer) clearTimeout(appearanceSettleTimer);
  const sequence = ++appearanceSequence;

  const detail = (phase) => ({
    sequence,
    phase,
    reason,
    theme: root.dataset.theme,
    background: root.dataset.background,
    preference: themePreference,
  });

  appearanceFrame = requestAnimationFrame(() => {
    appearanceFrame = 0;
    appearanceSettleFrame = requestAnimationFrame(() => {
      appearanceSettleFrame = 0;
      const eventDetail = detail('commit');
      window.dispatchEvent(new CustomEvent('kings:appearancechange', { detail: eventDetail }));
      window.dispatchEvent(new CustomEvent('ray:appearancechange', { detail: eventDetail }));
    });
  });

  appearanceSettleTimer = window.setTimeout(() => {
    appearanceSettleTimer = 0;
    requestAnimationFrame(() => {
      if (sequence !== appearanceSequence) return;
      const eventDetail = detail('settled');
      window.dispatchEvent(new CustomEvent('kings:appearancesettled', { detail: eventDetail }));
      window.dispatchEvent(new CustomEvent('ray:appearancesettled', { detail: eventDetail }));
    });
  }, 210);
}

/* =========================================================
   02. THEME MODE + STYLE CONTROLS
========================================================= */
function syncBackgroundForTheme(actualTheme) {
  const allowed = actualTheme === 'light' ? LIGHT_BACKGROUNDS : DARK_BACKGROUNDS;
  const fallback = actualTheme === 'light' ? 'paper' : 'black';
  let selected = actualTheme === 'light' ? lightBackgroundPreference : darkBackgroundPreference;

  if (!allowed.has(selected)) selected = fallback;
  root.dataset.background = selected;

  document.querySelectorAll('[data-background-choice]').forEach((button) => {
    const value = button.dataset.backgroundChoice;
    const visible = allowed.has(value);
    button.hidden = !visible;
    button.disabled = !visible;
    button.setAttribute('aria-hidden', String(!visible));
    button.classList.toggle('active', visible && value === selected);
  });
}

function applyThemePreference() {
  const actualTheme = themePreference === 'system' ? (systemQuery.matches ? 'light' : 'dark') : themePreference;
  root.dataset.themePreference = themePreference;
  root.classList.add('theme-switching');
  clearTimeout(themeSwitchTimer);
  themeSwitchTimer = window.setTimeout(() => root.classList.remove('theme-switching'), 180);
  root.dataset.theme = actualTheme;
  syncBackgroundForTheme(actualTheme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', actualTheme === 'light' ? '#F7F3EC' : '#080808');
  document.querySelectorAll('[data-theme-choice]').forEach((b) => b.classList.toggle('active', b.dataset.themeChoice === themePreference));
  signalAppearanceChange('theme');
}

function setTheme(v) {
  if (v !== 'dark' && v !== 'light' && v !== 'system') return;
  themePreference = v;
  root.dataset.themePreference = v;
  try { localStorage.setItem(THEME_PREFERENCE_KEY, v); } catch (_) {}
  applyThemePreference();
}

function setBackground(value) {
  const actualTheme = root.dataset.theme === 'light' ? 'light' : 'dark';
  const allowed = actualTheme === 'light' ? LIGHT_BACKGROUNDS : DARK_BACKGROUNDS;
  if (!allowed.has(value)) return;

  if (actualTheme === 'light') lightBackgroundPreference = value;
  else darkBackgroundPreference = value;

  root.dataset.background = value;
  document.querySelectorAll('[data-background-choice]').forEach((button) => {
    button.classList.toggle('active', !button.hidden && button.dataset.backgroundChoice === value);
  });
  signalAppearanceChange('background');
}

function setDataset(name, value, sel, key) {
  root.dataset[name] = value;
  document.querySelectorAll(sel).forEach((b) => b.classList.toggle('active', b.dataset[key] === value));
  signalAppearanceChange(name);
}

function setPanelMorphOrigin(panel, source) {
  if (!panel || !source) return;
  const panelRect = panel.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const sourceCenterX = sourceRect.left + sourceRect.width * 0.5;
  const sourceCenterY = sourceRect.top + sourceRect.height * 0.5;
  const x = Math.max(24, Math.min(panelRect.width - 24, sourceCenterX - panelRect.left));
  const y = Math.max(0, Math.min(panelRect.height, sourceCenterY - panelRect.top));
  const farX = Math.max(x, panelRect.width - x);
  const farY = Math.max(y, panelRect.height - y);
  const radius = Math.hypot(farX, farY) + 36;
  panel.style.setProperty('--liquid-origin-x', `${x}px`);
  panel.style.setProperty('--liquid-origin-y', `${y}px`);
  panel.style.setProperty('--liquid-open-radius', `${radius}px`);
}

function setMenuState(open) {
  if (open) setPanelMorphOrigin(mobileDrawer, mobileToggle);
  mobileDrawer.classList.toggle('open', open);
  mobileDrawer.classList.toggle('material-opening', open);
  mobileDrawer.toggleAttribute('inert', !open);
  mobileDrawer.setAttribute('aria-hidden', String(!open));
  mobileToggle.classList.toggle('open', open);
  mobileToggle.setAttribute('aria-expanded', String(open));
  mobileToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  body.classList.toggle('menu-open', open);
  if (open) window.setTimeout(() => mobileDrawer.classList.remove('material-opening'), 560);
}

function setStudioState(open) {
  if (open) setPanelMorphOrigin(studio, studioToggle);
  studio.classList.toggle('open', open);
  studio.classList.toggle('material-opening', open);
  studio.toggleAttribute('inert', !open);
  studio.setAttribute('aria-hidden', String(!open));
  body.classList.toggle('theme-open', open);
  studioToggle.setAttribute('aria-expanded', String(open));
  studioToggle.setAttribute('aria-label', open ? 'Close Theme Studio' : 'Open Theme Studio');
  if (open) {
    requestAnimationFrame(() => {
      const studioBody = studio.querySelector('.studio-body');
      if (studioBody) studioBody.scrollTop = 0;
    });
    window.setTimeout(() => studio.classList.remove('material-opening'), 600);
  }
}

function closePanels() { setStudioState(false); setMenuState(false); }

/* =========================================================
   03. NAVIGATION STATE
========================================================= */
function updateNavMaterial() { nav.classList.toggle('scrolled', window.scrollY > 40); }
window.addEventListener('scroll', updateNavMaterial, { passive: true });
systemQuery.addEventListener('change', applyThemePreference);
applyThemePreference();
updateNavMaterial();
setStudioState(false);
setMenuState(false);

/* =========================================================
   02B. PRELOADER SCREEN (0 -> 100 COUNTER & CROWN)
========================================================= */
(() => {
  const loader = document.getElementById('bootLoader');
  const counterEl = document.getElementById('bootCounter');
  const progressEl = document.getElementById('bootProgressBar');

  if (!loader || !counterEl || !progressEl) {
    document.documentElement.classList.add('boot-complete');
    return;
  }

  document.documentElement.setAttribute('aria-busy', 'true');

  const duration = 1250; // 1.25s smooth progress
  const startTime = performance.now();
  let completed = false;

  function updateLoader(currentTime) {
    const elapsed = currentTime - startTime;
    const rawProgress = Math.min(1, elapsed / duration);

    // Ease-in-out quadratic curve for responsive feeling
    const easeProgress = rawProgress < 0.5
      ? 2 * rawProgress * rawProgress
      : -1 + (4 - 2 * rawProgress) * rawProgress;

    const currentPercent = Math.min(100, Math.floor(easeProgress * 100));

    counterEl.textContent = currentPercent;
    progressEl.style.width = currentPercent + '%';

    if (rawProgress < 1) {
      requestAnimationFrame(updateLoader);
    } else {
      finishLoader();
    }
  }

  function finishLoader() {
    if (completed) return;
    completed = true;
    counterEl.textContent = '100';
    progressEl.style.width = '100%';

    window.setTimeout(() => {
      document.documentElement.classList.add('boot-complete');
      document.documentElement.removeAttribute('aria-busy');
      window.setTimeout(() => {
        if (loader && loader.parentNode) {
          loader.remove();
        }
      }, 550);
    }, 120);
  }

  requestAnimationFrame(updateLoader);
  window.setTimeout(finishLoader, 2200);
})();

studioToggle.addEventListener('click', () => { setStudioState(!studio.classList.contains('open')); setMenuState(false); });
studioClose.addEventListener('click', closePanels);
mobileToggle.addEventListener('click', () => { setMenuState(!mobileDrawer.classList.contains('open')); setStudioState(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });
mobileDrawer.querySelectorAll('a').forEach((l) => l.addEventListener('click', closePanels));

const navigationLinks = [...document.querySelectorAll('.nav-links a, .mobile-drawer a')];
const desktopNavLinks = document.querySelector('.nav-links');
const navActiveFill = desktopNavLinks ? document.createElement('span') : null;
if (navActiveFill) {
  navActiveFill.className = 'nav-active-fill';
  navActiveFill.setAttribute('aria-hidden', 'true');
  desktopNavLinks.prepend(navActiveFill);
}

function syncNavActiveFill() {
  if (!desktopNavLinks || !navActiveFill || getComputedStyle(desktopNavLinks).display === 'none') return;
  const active = desktopNavLinks.querySelector('a.active, a[aria-current="true"]');
  if (!active) {
    navActiveFill.classList.remove('is-visible');
    return;
  }
  const parentRect = desktopNavLinks.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  navActiveFill.style.setProperty('--nav-fill-x', `${rect.left - parentRect.left}px`);
  navActiveFill.style.setProperty('--nav-fill-y', `${rect.top - parentRect.top}px`);
  navActiveFill.style.setProperty('--nav-fill-w', `${rect.width}px`);
  navActiveFill.style.setProperty('--nav-fill-h', `${rect.height}px`);
  navActiveFill.classList.add('is-visible');
}

const navigationSections = ['work', 'execution', 'services', 'about', 'contact']
  .map((id) => document.getElementById(id))
  .filter(Boolean);

function setActiveNavigation(id) {
  navigationLinks.forEach((link) => {
    const active = link.getAttribute('href') === `#${id}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  window.requestAnimationFrame(syncNavActiveFill);
}

let navigationFrame = 0;
let navigationScrollTarget = null;
let navigationSettleTimer = 0;
let navigationFallbackTimer = 0;

function clearNavigationScrollLock(syncAfter = true) {
  navigationScrollTarget = null;
  window.clearTimeout(navigationSettleTimer);
  window.clearTimeout(navigationFallbackTimer);
  navigationSettleTimer = 0;
  navigationFallbackTimer = 0;
  if (syncAfter) requestNavigationSync();
}

function syncActiveNavigation() {
  if (!navigationSections.length) return;

  if (navigationScrollTarget) {
    setActiveNavigation(navigationScrollTarget.id);
    return;
  }

  const navHeight = nav?.getBoundingClientRect().height || 0;
  const activationPoint = window.scrollY + navHeight + 24;
  let activeSection = null;

  for (const section of navigationSections) {
    if (activationPoint >= section.offsetTop) activeSection = section;
    else break;
  }

  const pageBottom = window.scrollY + window.innerHeight;
  const documentBottom = document.documentElement.scrollHeight;
  if (pageBottom >= documentBottom - 4) {
    activeSection = navigationSections[navigationSections.length - 1];
  }

  setActiveNavigation(activeSection?.id || null);
}

function requestNavigationSync() {
  if (navigationFrame) return;
  navigationFrame = window.requestAnimationFrame(() => {
    navigationFrame = 0;
    syncActiveNavigation();
  });
}

function scheduleNavigationUnlock() {
  if (!navigationScrollTarget) return;
  window.clearTimeout(navigationSettleTimer);
  navigationSettleTimer = window.setTimeout(() => {
    clearNavigationScrollLock(true);
  }, 130);
}

window.addEventListener('scroll', () => {
  if (navigationScrollTarget) {
    setActiveNavigation(navigationScrollTarget.id);
    scheduleNavigationUnlock();
    return;
  }
  requestNavigationSync();
}, { passive: true });

window.addEventListener('scrollend', () => {
  if (navigationScrollTarget) clearNavigationScrollLock(true);
}, { passive: true });

window.addEventListener('resize', () => {
  if (!navigationScrollTarget) requestNavigationSync();
  window.requestAnimationFrame(syncNavActiveFill);
}, { passive: true });

window.addEventListener('load', () => {
  requestNavigationSync();
  window.requestAnimationFrame(syncNavActiveFill);
}, { once: true });

navigationLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const id = link.getAttribute('href')?.slice(1);
    const section = navigationSections.find((item) => item.id === id);
    if (!section) return;

    event.preventDefault();
    navigationScrollTarget = section;
    setActiveNavigation(id);

    const navHeight = nav?.getBoundingClientRect().height || 0;
    const targetY = Math.max(0, section.getBoundingClientRect().top + window.scrollY - navHeight - 24);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (window.location.hash !== `#${id}`) {
      history.pushState(null, '', `#${id}`);
    }

    window.scrollTo({
      top: targetY,
      behavior: reducedMotion ? 'auto' : 'smooth'
    });

    if (reducedMotion || Math.abs(window.scrollY - targetY) < 2) {
      window.setTimeout(() => clearNavigationScrollLock(true), 0);
      return;
    }

    window.clearTimeout(navigationFallbackTimer);
    navigationFallbackTimer = window.setTimeout(() => {
      clearNavigationScrollLock(true);
    }, 1800);
  });
});

window.addEventListener('wheel', () => { if (navigationScrollTarget) clearNavigationScrollLock(true); }, { passive: true });
window.addEventListener('touchstart', () => { if (navigationScrollTarget) clearNavigationScrollLock(true); }, { passive: true });

syncActiveNavigation();

/* =========================================================
   04. THEME STUDIO BUTTONS
========================================================= */
document.querySelectorAll('[data-theme-choice]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeChoice)));
document.querySelectorAll('[data-background-choice]').forEach((b) => b.addEventListener('click', () => setBackground(b.dataset.backgroundChoice)));
document.querySelectorAll('[data-font-head-choice]').forEach((b) => b.addEventListener('click', () => setDataset('fontHead', b.dataset.fontHeadChoice, '[data-font-head-choice]', 'fontHeadChoice')));
document.querySelectorAll('[data-font-body-choice]').forEach((b) => b.addEventListener('click', () => setDataset('fontBody', b.dataset.fontBodyChoice, '[data-font-body-choice]', 'fontBodyChoice')));
document.querySelectorAll('[data-font-button-choice]').forEach((b) => b.addEventListener('click', () => setDataset('fontButton', b.dataset.fontButtonChoice, '[data-font-button-choice]', 'fontButtonChoice')));
document.querySelectorAll('[data-accent-choice]').forEach((b) => b.addEventListener('click', () => setDataset('accent', b.dataset.accentChoice, '[data-accent-choice]', 'accentChoice')));
themeToggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

/* =========================================================
   05. BUILD DIRECTION INTERACTION
========================================================= */
const fitData = {
  role: {
    kicker: 'Technical role',
    title: 'I bridge high-level product strategy, world-class UI, and robust systems.',
    copy: '4+ years across React, Next.js, Node.js, TypeScript, WordPress, Shopify, SEO, and UI-focused frontend systems.',
    output: [
      ['Frontend depth', 'Responsive UI, bespoke design systems, and fluid interaction detail.'],
      ['Full-stack range', 'Production APIs, high-throughput workflows, and resilient architecture.'],
      ['Business sense', 'Conversion clarity, crisp brand positioning, and user-centric execution.']
    ]
  },
  saas: {
    kicker: 'Platform fit',
    title: 'For SaaS products, real-time portals, and mission-critical workflows.',
    copy: 'Dashboards, workflows, portals, tools, and clean product interfaces built to scale.',
    output: [
      ['Dashboards', 'Structured analytics, data visualization, and role-based permissions.'],
      ['Workflows', 'Stateful forms, real-time queues, webhooks, and automation pipelines.'],
      ['Architecture', 'Modular component hierarchy, clean state machines, and maintainable structure.']
    ]
  },
  business: {
    kicker: 'Client fit',
    title: 'For businesses demanding elite digital presentation and maximum conversion.',
    copy: 'Bespoke corporate websites engineered with technical SEO and unmistakable brand authority.',
    output: [
      ['Brand clarity', 'Immersive layouts, refined visual hierarchy, and persuasive pacing.'],
      ['Technical SEO', 'Semantic foundations, OpenGraph, JSON-LD Schema, and Core Web Vitals.'],
      ['Conversion', 'Seamless customer journeys, high-trust typography, and zero friction.']
    ]
  },
  commerce: {
    kicker: 'Commerce fit',
    title: 'For Shopify & e-commerce brands needing elevated trust and checkout velocity.',
    copy: 'Conversion-engineered storefronts built for rapid load speeds, mobile perfection, and effortless management.',
    output: [
      ['Storefront UX', 'High-converting collection layouts, product galleries, and cart flows.'],
      ['Trust flow', 'Visual hierarchy, buying clarity, and reduced friction.'],
      ['Operations', 'Manageable structure for products, content, and SEO.']
    ]
  }
};

const fitKicker = document.getElementById('fitKicker');
const fitTitle  = document.getElementById('fitTitle');
const fitCopy   = document.getElementById('fitCopy');
const fitOutput = document.getElementById('fitOutput');
const fitTabsContainer = document.querySelector('.fit-tabs');
const fitActiveFill = fitTabsContainer ? document.createElement('span') : null;

if (fitActiveFill) {
  fitActiveFill.className = 'fit-active-fill';
  fitActiveFill.setAttribute('aria-hidden', 'true');
  fitTabsContainer.prepend(fitActiveFill);
}

function syncFitActiveFill() {
  if (!fitTabsContainer || !fitActiveFill) return;
  const active = fitTabsContainer.querySelector('.fit-tab.active');
  if (!active) {
    fitActiveFill.classList.remove('is-visible');
    return;
  }
  const parentRect = fitTabsContainer.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  fitActiveFill.style.setProperty('--fit-fill-x', `${rect.left - parentRect.left}px`);
  fitActiveFill.style.setProperty('--fit-fill-y', `${rect.top - parentRect.top}px`);
  fitActiveFill.style.setProperty('--fit-fill-w', `${rect.width}px`);
  fitActiveFill.style.setProperty('--fit-fill-h', `${rect.height}px`);
  fitActiveFill.classList.add('is-visible');
}

function renderFit(key) {
  const d = fitData[key];
  fitKicker.textContent = d.kicker;
  fitTitle.textContent  = d.title;
  fitCopy.textContent   = d.copy;
  fitOutput.innerHTML   = d.output.map(([h,c]) => `<div><strong>${h}</strong><span>${c}</span></div>`).join('');
  document.querySelectorAll('.fit-tab').forEach((t) => {
    const active = t.dataset.fit === key;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  window.requestAnimationFrame(syncFitActiveFill);
  signalAppearanceChange('fit');
}

const fitTabs = [...document.querySelectorAll('.fit-tab')];
let lastTouchFitActivation = 0;

fitTabs.forEach((t, index) => {
  t.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (!event.isPrimary) return;
    lastTouchFitActivation = performance.now();
    renderFit(t.dataset.fit);
  });

  t.addEventListener('click', () => {
    if (performance.now() - lastTouchFitActivation < 450) return;
    renderFit(t.dataset.fit);
  });

  t.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
    const next = fitTabs[(index + direction + fitTabs.length) % fitTabs.length];
    renderFit(next.dataset.fit);
    next.focus();
  });
});

renderFit('role');
window.addEventListener('resize', () => window.requestAnimationFrame(syncFitActiveFill), { passive: true });

/* =========================================================
   06. EXECUTION STAGE CONTROLS
========================================================= */
const executionControls = [...document.querySelectorAll('[data-execution-step]')];

function selectExecutionStep(step) {
  executionControls.forEach((control) => {
    const selected = control.dataset.executionStep === String(step);
    control.classList.toggle('is-selected', selected);
    control.setAttribute('aria-pressed', String(selected));
    if (selected) control.dataset.liquidTint = '1';
    else delete control.dataset.liquidTint;
  });
}

executionControls.forEach((control) => {
  control.addEventListener('click', () => selectExecutionStep(control.dataset.executionStep));
});
selectExecutionStep(3);

/* =========================================================
   07. SCROLL REVEAL ANIMATION
========================================================= */
const revealEls = document.querySelectorAll('.reveal:not(.visible)');

const obs = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      obs.unobserve(e.target);
    }
  });
}, {
  threshold: 0.02,
  rootMargin: '0px 0px -30px 0px'
});

revealEls.forEach((el) => {
  const rect = el.getBoundingClientRect();
  // Any element already in viewport on load reveals immediately
  if (rect.top < window.innerHeight - 20) {
    el.classList.add('visible');
  } else {
    obs.observe(el);
  }
});

/* =========================================================
   08. CUSTOM MAGNETIC CURSOR & AMBIENT VISUAL EFFECTS
========================================================= */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const isTouch = window.matchMedia('(hover: none)').matches;

  /* ── 1. CUSTOM MAGNETIC CURSOR ─────────────────────────── */
  if (!isTouch) {
    const cursorCSS = document.createElement('style');
    cursorCSS.textContent = `*, *::before, *::after { cursor: none !important; }`;
    document.head.append(cursorCSS);

    const dot  = document.createElement('div');
    const ring = document.createElement('div');
    dot.className  = 'cur-dot';
    ring.className = 'cur-ring';
    document.body.append(dot, ring);

    let mx = -300, my = -300, rx = -300, ry = -300;
    let cursorFrame = 0;

    function animateCursorRing() {
      cursorFrame = 0;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate(calc(${rx}px - 50%), calc(${ry}px - 50%))`;
      if (Math.abs(mx - rx) > .18 || Math.abs(my - ry) > .18) {
        cursorFrame = requestAnimationFrame(animateCursorRing);
      }
    }

    document.addEventListener('mousemove', e => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(calc(${mx}px - 50%), calc(${my}px - 50%))`;
      if (!cursorFrame) cursorFrame = requestAnimationFrame(animateCursorRing);
    }, { passive: true });

    const sel = 'a, button, [role="tab"], .fit-tab, .swatch, .segment, .option, .project-cta, .contact-link, .project-row';
    document.querySelectorAll(sel).forEach(el => {
      el.addEventListener('mouseenter', () => ring.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('is-hover'));
    });

    document.addEventListener('mousedown', () => ring.classList.add('is-click'));
    document.addEventListener('mouseup',   () => ring.classList.remove('is-click'));
  }

  /* ── 2. HERO GRAIN OVERLAY ──────────────────────────────── */
  const heroEl = document.querySelector('.hero');
  if (heroEl) {
    const grain = document.createElement('div');
    grain.className = 'hero-grain';
    heroEl.prepend(grain);
  }

  /* ── 3. FLOATING ACCENT ORBS ────────────────────────────── */
  if (heroEl) {
    const ORB_DEFS = [
      { l: '60%', t: '5%',  w: 360, h: 300, op: .12, dur: '14s', tx:  '28px', ty: '-22px', delay: '0s'  },
      { l: '15%', t: '52%', w: 240, h: 220, op: .08, dur: '11s', tx: '-22px', ty:  '16px', delay: '3s'  },
      { l: '78%', t: '62%', w: 170, h: 155, op: .07, dur: '18s', tx:  '14px', ty: '-32px', delay: '6.5s'},
    ];

    ORB_DEFS.forEach(o => {
      const orb = document.createElement('div');
      orb.className = 'hero-orb';
      orb.style.cssText = `
        left:${o.l}; top:${o.t};
        width:${o.w}px; height:${o.h}px;
        background: radial-gradient(circle, rgba(var(--accent-rgb),${o.op}) 0%, transparent 70%);
        --orb-dur:${o.dur}; --orb-tx:${o.tx}; --orb-ty:${o.ty};
        animation-delay:${o.delay};
        z-index:0;
      `;
      heroEl.prepend(orb);
    });
  }

  /* ── 4. HERO MOUSE PARALLAX ─────────────────────────────── */
  if (!isTouch && heroEl) {
    const portraitFrame = document.querySelector('.portrait-frame');
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    heroEl.addEventListener('mousemove', (event) => {
      const rect = heroEl.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2));
      targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2));
    });

    heroEl.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
    });

    let heroMotionFrame = 0;
    function opticalHoverLoop() {
      heroMotionFrame = 0;
      currentX += (targetX - currentX) * .10;
      currentY += (targetY - currentY) * .10;
      heroEl.style.setProperty('--hero-light-x', `${78 + currentX * 4.5}%`);
      heroEl.style.setProperty('--hero-light-y', `${42 + currentY * 3.5}%`);
      if (portraitFrame) {
        portraitFrame.style.transform =
          `perspective(1100px) rotateY(${currentX * 1.65}deg) rotateX(${-currentY * 1.15}deg) scale(1.002)`;
      }
      if (Math.abs(targetX - currentX) > .002 || Math.abs(targetY - currentY) > .002) {
        heroMotionFrame = requestAnimationFrame(opticalHoverLoop);
      }
    }
    const requestHeroMotion = () => {
      if (!heroMotionFrame) heroMotionFrame = requestAnimationFrame(opticalHoverLoop);
    };
    heroEl.addEventListener('mousemove', requestHeroMotion, { passive: true });
    heroEl.addEventListener('mouseleave', requestHeroMotion, { passive: true });
  }

  /* ── 5. META TILE ENTRANCE SHIMMER ─────────────────────── */
  const metaTiles = document.querySelectorAll('.meta-tile');
  if (metaTiles.length) {
    const sweepObs = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => {
            e.target.classList.add('do-sweep');
            e.target.addEventListener('animationend', () =>
              e.target.classList.remove('do-sweep'), { once: true }
            );
          }, i * 140);
          sweepObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.6 });

    metaTiles.forEach(t => sweepObs.observe(t));
  }
})();
