// Brauð & Co prototype runtime. Motion values are the reference's (Don Molinico bundle), see DESIGN.md §6.
const L = window.BC_LANG || 'is';
// every page knows its relative path to the site root, so the build works under any base path (GitHub Pages)
const ROOT = window.BC_ROOT || '';
const rel = (u) => (typeof u === 'string' && u.startsWith('/') ? ROOT + u.slice(1) : u);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = () => matchMedia('(min-width: 960px)').matches;

const TXT = {
  is: {
    openUntil: (t) => `Opið til ${t}`, opensAt: (d, t) => `Lokað · opnar ${d} kl.\u00a0${t}`, today: 'í dag', tomorrow: 'á morgun',
    days: ['sunnudag', 'mánudag', 'þriðjudag', 'miðvikudag', 'fimmtudag', 'föstudag', 'laugardag'],
    count: (n) => (n === 1 ? '1 bakarí opið núna' : `${n} bakarí opin núna`),
    firstOpens: (name, d, t) => `Lokað núna · ${name} opnar ${d}\u00a0kl.\u00a0${t}`,
    nearBusy: 'Finn staðsetningu…', nearFail: 'Fann ekki staðsetningu. Listinn er óbreyttur.', nearDone: 'Raðað eftir fjarlægð frá þér.',
    km: 'km', items: (n) => `${n} vörur`, weekly: 'Snúður vikunnar', ig: 'Instagram-færsla frá Brauð & Co', menuOpen: 'Opna valmynd', menuClose: 'Loka valmynd',
    mailSubject: 'Fyrirspurn um veislu', mailFields: ['Nafn', 'Netfang', 'Dagsetning', 'Fjöldi gesta', 'Sótt í', 'Óskir'],
  },
  en: {
    openUntil: (t) => `Open until ${t}`, opensAt: (d, t) => `Closed · opens ${d} at\u00a0${t}`, today: 'today', tomorrow: 'tomorrow',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    count: (n) => (n === 1 ? '1 bakery open now' : `${n} bakeries open now`),
    firstOpens: (name, d, t) => `Closed now · ${name} opens ${d}\u00a0at\u00a0${t}`,
    nearBusy: 'Finding you…', nearFail: 'Could not get your location. The list is unchanged.', nearDone: 'Sorted by distance from you.',
    km: 'km', items: (n) => `${n} items`, weekly: 'Snúður of the week', ig: 'Instagram post by Brauð & Co', menuOpen: 'Open menu', menuClose: 'Close menu',
    mailSubject: 'Catering enquiry', mailFields: ['Name', 'Email', 'Date', 'Guests', 'Pickup', 'Wishes'],
  },
}[L];

document.documentElement.classList.add('js');

/* ---------- clock: Iceland is UTC all year. ?now=2026-10-19T06:45 overrides (tests) ---------- */
function now() {
  const q = new URLSearchParams(location.search).get('now');
  const d = q ? new Date(q + 'Z') : new Date();
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function bakeryState(hours) {
  const { day, min } = now();
  const [o, c] = hours[day];
  if (min >= toMin(o) && min < toMin(c)) return { open: true, text: TXT.openUntil(c) };
  if (min < toMin(o)) return { open: false, text: TXT.opensAt(TXT.today, o), next: [0, toMin(o), o, TXT.today] };
  const oo = hours[(day + 1) % 7][0];
  return { open: false, text: TXT.opensAt(TXT.tomorrow, oo), next: [1, toMin(oo), oo, TXT.tomorrow] };
}

function paintOpen() {
  let n = 0;
  $$('[data-bakery]').forEach((row) => {
    const s = bakeryState(JSON.parse(row.dataset.hours));
    row.classList.toggle('is-open', s.open);
    const el = $('[data-state]', row);
    if (el) el.textContent = s.text;
  });
  // count from unique bakeries (the home and the bakeries page each list all eight once)
  const seen = new Set();
  let first = null;
  $$('[data-bakery]').forEach((r) => {
    if (seen.has(r.dataset.bakery)) return;
    seen.add(r.dataset.bakery);
    if (r.classList.contains('is-open')) { n++; return; }
    const s = bakeryState(JSON.parse(r.dataset.hours));
    const key = s.next[0] * 1440 + s.next[1];
    if (!first || key < first.key) first = { key, name: $('.bc-row__name', r).textContent, t: s.next[2], d: s.next[3] };
  });
  const c = $('[data-open-count]');
  if (c && seen.size) c.textContent = n ? TXT.count(n) : TXT.firstOpens(first.name, first.d, first.t);
}

/* ---------- nearest bakery (optional geolocation) ---------- */
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function initNear() {
  $$('[data-near]').forEach((btn) => btn.addEventListener('click', () => {
    const msg = $('[data-near-msg]');
    msg.textContent = TXT.nearBusy;
    if (!navigator.geolocation) { msg.textContent = TXT.nearFail; return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $$('[data-rows]').forEach((list) => {
        const rows = $$(':scope > [data-bakery]', list).map((r) => ({ r, d: haversine(me, { lat: +r.dataset.lat, lng: +r.dataset.lng }) }));
        rows.sort((a, b) => a.d - b.d).forEach(({ r, d }) => { $('[data-dist]', r).textContent = `${d.toFixed(1).replace('.', L === 'is' ? ',' : '.')} ${TXT.km}`; list.append(r); });
      });
      msg.textContent = TXT.nearDone;
      window.ScrollTrigger?.refresh();
    }, () => { msg.textContent = TXT.nearFail; }, { timeout: 9000, maximumAge: 300000 });
  }));
}

/* ---------- reveals (reference: IntersectionObserver adds is-inview, CSS transitions do the rest) ---------- */
function initReveals(start) {
  const targets = $$('[data-st], [data-observe]');
  if (reduce) { targets.forEach((t) => t.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
  targets.forEach((t) => { if (!t.closest('[data-hero]') || start) io.observe(t); });
  return io;
}

/* ---------- intro: their badge drops once per session, the hero waits for it ---------- */
function intro(done) {
  const hero = $('[data-hero]');
  let seen = false;
  try { seen = sessionStorage.getItem('bc-intro') === '1'; } catch (e) { /* private mode */ }
  if (!hero || reduce || seen) { done(); return; }
  try { sessionStorage.setItem('bc-intro', '1'); } catch (e) { /* ignore */ }
  const layer = document.createElement('div');
  layer.className = 'bc-intro';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = $('[data-logo]').innerHTML;
  document.body.append(layer);
  const g = window.gsap;
  if (!g) { layer.remove(); done(); return; }
  g.timeline({ onComplete: () => { layer.remove(); } })
    .fromTo(layer.firstElementChild, { yPercent: -120, rotate: -8 }, { yPercent: 0, rotate: 0, duration: .5, ease: 'expo.out' })
    .to(layer, { clipPath: 'inset(0 0 100% 0)', duration: .5, ease: 'expo.inOut', onStart: done }, '+=.1');
}

/* ---------- smooth scroll + ScrollTrigger work ---------- */
let lenis = null;
function initScroll() {
  const g = window.gsap, ST = window.ScrollTrigger;
  if (!g || !ST) return;
  g.registerPlugin(ST);
  if (finePointer && !reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1 });
    lenis.on('scroll', ST.update);
    g.ticker.add((t) => lenis.raf(t * 1000));
    g.ticker.lagSmoothing(0);
  }
  if (reduce) return;
  const mm = g.matchMedia();
  mm.add('(min-width: 960px)', () => {
    // reference: pinned fade-out, start "bottom bottom", end "bottom top", scrub, pin, pinSpacing false
    const hero = $('[data-hero]');
    if (hero) {
      g.timeline({ scrollTrigger: { trigger: hero, start: 'bottom bottom', end: 'bottom top', scrub: true, pin: true, pinSpacing: false } })
        .fromTo(hero, { opacity: 1 }, { opacity: 0, ease: 'none' });
    }
  });
  // reference parallax: start "top bottom", end "bottom top", scrub, small offset
  $$('[data-parallax]').forEach((el) => {
    g.fromTo(el, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ---------- showcase: type tabs + flavour tabs swap the cut-out (reference product-showcase) ---------- */
function initShowcase() {
  const root = $('[data-showcase]');
  if (!root) return;
  const data = JSON.parse($('[data-showcase-json]', root).textContent);
  const title = $('[data-show-title]', root), media = $('[data-show-media]', root), img = $('img', media);
  const flav = $('[data-show-flavours]', root), nameEl = $('[data-show-name]', root), priceEl = $('[data-show-price]', root);
  const menuBase = media.getAttribute('href').split('#')[0];
  let type = data[0], tl = null;
  // Measure only when the panel changes size, never on scroll.
  new ResizeObserver(([entry]) => {
    root.style.setProperty('--bc-show-height', `${entry.borderBoxSize[0].blockSize}px`);
  }).observe(root);

  function setItem(it, animate = true) {
    const apply = () => {
      img.src = `${ROOT}assets/img/cut-${it.cut}-960.webp`;
      img.srcset = `${ROOT}assets/img/cut-${it.cut}-480.webp 480w, ${ROOT}assets/img/cut-${it.cut}-960.webp 960w`;
      media.href = `${menuBase}#${it.sku}`;
      media.setAttribute('aria-label', it.name);
      nameEl.textContent = it.name;
      priceEl.textContent = it.price;
    };
    $$('[data-sku]', flav).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sku === it.sku)));
    const g = window.gsap;
    if (!animate || reduce || !g) { apply(); return; }
    tl?.kill();
    tl = g.timeline()
      .to(img, { yPercent: 16, opacity: 0, duration: .25, ease: 'power3.out' })
      .add(apply)
      .fromTo(img, { yPercent: -16, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .6, ease: 'expo.out' });
  }
  function setType(g, animate = true) {
    type = g;
    $$('[data-type]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === g.id)));
    title.textContent = g.label;
    flav.innerHTML = g.items.map((it, n) => `<button type="button" class="bc-tab" aria-pressed="${n === 0}" data-sku="${it.sku}">${it.name}</button>`).join('');
    flav.hidden = g.items.length < 2;
    setItem(g.items[0], animate);
    if (animate && !reduce && window.gsap) window.gsap.fromTo(title, { yPercent: 30, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .6, ease: 'expo.out', overwrite: true });
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type]'), f = e.target.closest('[data-sku]');
    if (t && t.getAttribute('aria-pressed') !== 'true') setType(data.find((g) => g.id === t.dataset.type));
    if (f && f.getAttribute('aria-pressed') !== 'true') setItem(type.items.find((it) => it.sku === f.dataset.sku));
  });
  // arrow keys inside each tablist
  root.addEventListener('keydown', (e) => {
    const list = e.target.closest('[role="group"]');
    if (!list || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const tabs = $$('.bc-tab', list), i = tabs.indexOf(e.target);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus(); next.click();
  });
}

/* ---------- Instagram wall: reads the Worker's JSON (prototype: static file with the same shape) ---------- */
async function initInstagram() {
  const grid = $('[data-ig-grid]');
  if (!grid) return;
  try {
    const [feed, featured] = await Promise.all([
      fetch(ROOT + 'api/instagram.json').then((r) => r.json()),
      fetch(ROOT + 'api/featured.json').then((r) => r.json()).catch(() => null),
    ]);
    const tiles = $$('.bc-ig__tile', grid);
    const sample = (feed.data || []).some(p => p.sample);
    const notice = $('[data-ig-notice]');
    if (notice) notice.hidden = !sample;
    (feed.data || []).slice(0, tiles.length).forEach((p, i) => {
      const a = document.createElement('a');
      a.className = 'bc-ig__tile';
      a.href = rel(p.permalink);
      a.rel = 'noopener';
      a.setAttribute('aria-label', p.caption ? p.caption.slice(0, 90) : p.sample ? 'Brauð & Co · Instagram' : TXT.ig);
      a.innerHTML = `<img src="${rel(p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url)}" alt="" loading="lazy" decoding="async">`;
      tiles[i].replaceWith(a);
    });
    $$('.bc-ig__tile.is-loading', grid).forEach((t) => t.remove());
    const w = $('[data-weekly]', grid);
    if (featured && featured.item && w) {
      const f = featured.item;
      const card = document.createElement('a');
      card.className = 'bc-ig__weekly';
      card.href = rel(L === 'en' && f.link.startsWith('/matsedill/') ? f.link.replace('/matsedill/', '/en/menu/') : f.link);
      card.innerHTML = `<img src="${rel(f.image)}" alt="" width="1024" height="1024" loading="lazy"><span class="bc-ig__weekly-copy"><span class="bc-ig__weekly-k">${sample ? w.dataset.sampleLabel : TXT.weekly}</span><span class="bc-ig__weekly-n">${f.name[L]}</span><span>${f.price}</span></span>`;
      w.replaceWith(card);
    }
  } catch (e) {
    $$('.bc-ig__tile.is-loading', grid).forEach((t) => t.remove());
  }
}

/* ---------- header: burger panel with fixed-body lock; logo always lands at the top ---------- */
function initHeader() {
  const burger = $('[data-burger]'), panel = $('[data-panel]');
  const background = $$('main, .bc-foot, .bc-skip');
  let y = 0, hideTimer = 0;
  const lock = (on) => {
    const b = document.body;
    if (on) { y = scrollY; b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.left = '0'; b.style.right = '0'; lenis?.stop(); }
    else { b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; scrollTo(0, y); lenis?.start(); }
  };
  const set = (open, restore = true, instant = false) => {
    if (!burger) return;
    if (!open && burger.getAttribute('aria-expanded') !== 'true') return;
    burger.setAttribute('aria-expanded', String(open));
    $('.bc-sr', burger).textContent = open ? TXT.menuClose : TXT.menuOpen;
    clearTimeout(hideTimer);
    if (open) {
      panel.hidden = false;
      panel.getBoundingClientRect(); // commit the closed state so the open transition runs
      panel.classList.add('is-open');
    } else {
      panel.classList.remove('is-open');
      if (instant || reduce) panel.hidden = true;
      else hideTimer = setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 340);
    }
    background.forEach(el => { el.inert = open; });
    if (open) lock(true);
    else if (restore) lock(false);
    else { const b = document.body; b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; lenis?.start(); }
    if (open) $('a', panel).focus({ preventScroll: true });
  };
  burger?.addEventListener('click', () => set(burger.getAttribute('aria-expanded') !== 'true'));
  addEventListener('keydown', (e) => {
    if (burger?.getAttribute('aria-expanded') !== 'true') return;
    if (e.key === 'Escape') { e.preventDefault(); set(false); burger.focus({ preventScroll: true }); }
    if (e.key === 'Tab') {
      const links = $$('.bc-bar a, .bc-bar button, .bc-panel a').filter(el => el.getClientRects().length);
      const i = links.indexOf(document.activeElement);
      e.preventDefault();
      links[(i + (e.shiftKey ? links.length - 1 : 1)) % links.length].focus({ preventScroll: true });
    }
  });
  matchMedia('(min-width: 960px)').addEventListener('change', e => { if (e.matches) set(false, true, true); });
  // a link to another page keeps the menu up: the page transition wipes the next page over it.
  // Same-page links (and browsers without view transitions) close it right away.
  const crossDocVT = 'onpagereveal' in window && !reduce;
  $$('a', panel || document.createElement('div')).forEach((a) => a.addEventListener('click', () => {
    const u = new URL(a.href, location.href);
    const leaves = u.origin === location.origin && u.pathname !== location.pathname;
    if (!(leaves && crossDocVT)) set(false, false);
  }));
  addEventListener('pageshow', (e) => { if (e.persisted && burger?.getAttribute('aria-expanded') === 'true') { panel.classList.remove('is-open'); panel.hidden = true; set(false); } });
  $$('[data-logo], .bc-panel [data-home]').forEach((a) => a.addEventListener('click', (e) => {
    const target = new URL(a.href, location.href);
    if (target.pathname !== location.pathname) return;
    e.preventDefault();
    set(false, false);
    $('[data-logo]').focus({ preventScroll: true });
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    scrollTo({ top: 0, behavior: 'instant' });
    history.replaceState(null, '', location.pathname + location.search);
  }));
}

/* in-page jumps go through Lenis so the offset matches the fixed bar */
function initJumps() {
  $$('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    const el = $(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', a.getAttribute('href'));
  }));
}

/* Keyboard focus must reveal controls hidden by pinned/overlapping sections. */
function initFocus() {
  const move = y => {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo({ top: y, behavior: 'instant' });
    window.ScrollTrigger?.update();
  };
  document.addEventListener('focusin', e => {
    const target = e.target;
    if (!target.closest('main, .bc-foot') || !target.matches(':focus-visible')) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== target) return;
      const bar = $('.bc-bar').getBoundingClientRect().bottom;
      const el = target.matches('.bc-check input') ? target.nextElementSibling : target;
      const r = el.getBoundingClientRect(), show = target.closest('[data-showcase]');
      const hero = target.closest('[data-hero]');
      if (hero && wide() && !reduce) {
        const pin = window.ScrollTrigger?.getAll().find(t => t.trigger === hero && t.pin);
        if (pin) {
          const box = hero.getBoundingClientRect();
          const origin = pin.start - box.height + innerHeight;
          const centre = origin + r.top - box.top - bar - 12 - (innerHeight - bar - 24 - r.height) / 2;
          move(Math.max(0, Math.min(pin.start, centre)));
          return;
        }
      }
      if (show && wide() && !reduce) {
        const box = show.getBoundingClientRect();
        const origin = $('[data-show-origin]').getBoundingClientRect().top + scrollY;
        const centre = origin + r.top - box.top - bar - 12 - Math.max(0, (innerHeight - bar - 24 - r.height) / 2);
        move(Math.min(origin + Math.max(0, box.height - innerHeight), Math.max(0, centre)));
        return;
      }
      const cats = target.closest('.bc-menu') && !target.closest('.bc-menu__cats') ? $('.bc-menu__cats').getBoundingClientRect().height : 0;
      const safe = bar + cats + 12;
      if (r.top < safe) move(scrollY + r.top - safe);
      else if (r.bottom > innerHeight - 8 && r.height < innerHeight - safe) move(scrollY + r.bottom - innerHeight + 8);
    });
  });
}

/* ---------- menu: allergen filter ---------- */
function initMenu() {
  const root = $('[data-menu]');
  if (!root) return;
  const wrap = $('[data-filter-wrap]', root);
  // phones: filter folded so products show first; open when a filter is active (from the URL) or on desktop
  if (wrap && !wide()) wrap.open = !!new URLSearchParams(location.search).get('an');
  const boxes = $$('[data-allergen]', root), count = $('[data-count]', root), items = $$('.bc-item', root);
  const apply = () => {
    const out = boxes.filter((b) => b.checked).map((b) => b.value);
    let n = 0;
    items.forEach((it) => {
      const al = (it.dataset.allergens || '').split(' ');
      const hide = out.length > 0 && (it.dataset.ingredientsKnown !== 'true' || out.some((a) => al.includes(a)));
      it.hidden = hide;
      if (!hide) n++;
    });
    $$('.bc-menu__sec', root).forEach((s) => { s.hidden = !$$('.bc-item:not([hidden])', s).length; });
    count.textContent = TXT.items(n);
    const u = new URL(location.href);
    if (out.length) u.searchParams.set('an', out.join(',')); else u.searchParams.delete('an');
    history.replaceState(null, '', u);
    window.ScrollTrigger?.refresh();
  };
  const pre = (new URLSearchParams(location.search).get('an') || '').split(',').filter(Boolean);
  boxes.forEach((b) => { b.checked = pre.includes(b.value); });
  if (pre.length) apply();
  boxes.forEach((b) => b.addEventListener('change', apply));
  $('[data-allergen-clear]', root)?.addEventListener('click', () => { boxes.forEach((b) => { b.checked = false; }); apply(); });
}

/* ---------- catering request: composes an email (no backend in the prototype) ---------- */
function initRequest() {
  const form = $('[data-req]');
  if (!form) return;
  const fallbackError = $('[data-req-err]', form).textContent;
  const fields = ['name', 'email', 'date', 'guests'].map(n => form.elements[n]);
  fields.forEach(f => {
    const msg = document.createElement('p');
    msg.id = `${f.id}-error`; msg.className = 'bc-field__err'; msg.hidden = true;
    f.after(msg); f.setAttribute('aria-describedby', msg.id);
  });
  const validate = f => {
    const valid = f.validity.valid && (!f.required || !!f.value.trim());
    f.setAttribute('aria-invalid', String(!valid));
    const msg = document.getElementById(`${f.id}-error`);
    msg.hidden = valid;
    msg.textContent = valid ? '' : f.validationMessage || fallbackError;
    return valid;
  };
  fields.forEach(f => f.addEventListener('input', () => {
    if (f.hasAttribute('aria-invalid')) validate(f);
    if (fields.every(f => f.getAttribute('aria-invalid') !== 'true')) $('[data-req-err]', form).hidden = true;
    $('[data-req-ok]', form).hidden = true;
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-req-err]', form), ok = $('[data-req-ok]', form);
    const bad = fields.map(validate).some(v => !v);
    err.hidden = !bad; ok.hidden = true;
    if (bad) {
      const first = fields.find(f => f.getAttribute('aria-invalid') === 'true');
      err.textContent = document.getElementById(`${first.id}-error`).textContent;
      first.focus(); return;
    }
    const v = ['name', 'email', 'date', 'guests', 'pickup', 'notes'].map((n) => form.elements[n].value.trim());
    const body = TXT.mailFields.map((k, i) => `${k}: ${v[i] || '-'}`).join('\n');
    ok.hidden = false;
    location.href = `mailto:braudogco@braudogco.is?subject=${encodeURIComponent(TXT.mailSubject)}&body=${encodeURIComponent(body)}`;
  });
}

/* ---------- boot ---------- */
function boot() {
  window.BC_BOOTED = true;
  paintOpen();
  setInterval(paintOpen, 60000);
  initHeader();
  initJumps();
  initFocus();
  initNear();
  initShowcase();
  initMenu();
  initRequest();
  initInstagram();
  initScroll();
  const io = initReveals(false);
  intro(() => {
    const hero = $('[data-hero]');
    if (!hero) return;
    $$('[data-st]', hero).forEach((t) => (io ? io.observe(t) : t.classList.add('is-in')));
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
