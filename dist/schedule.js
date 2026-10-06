// "Programul săptămânii": the current week's programme (Monday–Sunday) from players_public_schedule, with
// the event of the week highlighted. Loaded after the main inline
// script (uses SUPABASE_URL and authHeaders). Exposes window.PlayersSchedule for the admin "Program" tab.
(() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const section = document.getElementById('program');
  const range = section.querySelector('.schedule-range');
  const featuredSlot = section.querySelector('.schedule-featured-slot');
  const daysList = section.querySelector('.schedule-days');

  // ---------- dates (local time, weeks start on Monday) ----------
  function weekStart(date) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return addDays(day, -((day.getDay() + 6) % 7));
  }
  function addDays(date, days) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }
  function isoDay(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
  function parseDay(iso) { const [year, month, day] = iso.split('-').map(Number); return new Date(year, month - 1, day); }
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  function dayLabel(date) {
    return `${capitalize(date.toLocaleDateString('ro-RO', { weekday: 'long' }))} ${date.getDate()} ${date.toLocaleDateString('ro-RO', { month: 'short' })}`;
  }
  function rangeLabel(start) {
    const end = addDays(start, 6), month = (date) => date.toLocaleDateString('ro-RO', { month: 'long' });
    if (start.getFullYear() !== end.getFullYear()) return `${start.getDate()} ${month(start)} ${start.getFullYear()} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
    if (start.getMonth() !== end.getMonth()) return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
    return `${start.getDate()} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
  }

  async function fetchWeek(start) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/players_public_schedule`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ p_week_start: isoDay(start) }) });
    if (!response.ok) throw new Error(`players_public_schedule HTTP ${response.status}`);
    return response.json();
  }

  // ---------- links to the site's own cards ----------
  function cardFor(name) { return [...document.querySelectorAll('#eventGrid .event')].find((card) => card.dataset.name === name) || null; }
  function cardLink(name) { const card = cardFor(name); return card?.id ? `#${card.id}` : '#events'; }
  // Banner shown for a day without its own image: the event's default programme banner, else the card poster.
  const DEFAULT_DAY_IMAGES = {
    'Seară de Șah': '/program/seara-de-sah.jpg',
    'Remi & Prieteni': '/program/remi.jpg',
    'Seară de Table': '/program/table.jpg',
    'Turneu de Ping-Pong': '/program/ping-pong.jpg',
  };
  function defaultImage(name) { return DEFAULT_DAY_IMAGES[name] || cardPoster(name); }
  function cardPoster(name) {
    const banner = cardFor(name)?.querySelector('.event-banner');
    const match = banner?.getAttribute('style')?.match(/--poster-image:url\('([^']+)'\)/);
    return match ? match[1] : '';
  }

  // Today first, then tomorrow and the rest of the week; days already gone go last.
  const WHEN_LABELS = { today: 'Azi', tomorrow: 'Mâine' };
  function dayOrder(start, now) {
    const today = isoDay(now), tomorrow = isoDay(addDays(now, 1));
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index), iso = isoDay(date);
      const when = iso === today ? 'today' : iso === tomorrow ? 'tomorrow' : iso < today ? 'past' : '';
      return { date, when };
    });
    return [...week.filter(({ when }) => when !== 'past'), ...week.filter(({ when }) => when === 'past')];
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  // The image is a button that opens it large in the #imageViewer popup.
  function eventImage(entry) {
    const image = element('img');
    image.src = entry.image_url || defaultImage(entry.linked_card);
    image.alt = '';
    image.loading = 'lazy';
    return zoomButton(image);
  }
  function zoomButton(image) {
    const button = element('button', 'image-zoom');
    button.type = 'button';
    button.setAttribute('aria-label', 'Mărește imaginea');
    button.append(image);
    return button;
  }

  // ---------- image popup ----------
  const viewer = document.getElementById('imageViewer');
  function openViewer(src) {
    viewer.querySelector('img').src = src;
    if (!viewer.open) viewer.showModal();
  }
  viewer.querySelector('.image-viewer-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', (event) => { if (event.target === viewer) viewer.close(); });
  section.addEventListener('click', (event) => {
    const button = event.target.closest('.image-zoom');
    if (button) openViewer(button.querySelector('img').src);
  });

  // when: 'today' | 'tomorrow' | 'past' | '' (a later day this week).
  function dayTile(date, entry, isFeatured, when) {
    const classes = ['schedule-day', entry ? '' : 'is-empty', isFeatured ? 'is-featured' : '', when === 'today' ? 'is-today' : '', when === 'past' ? 'is-past' : ''];
    const tile = element('article', classes.filter(Boolean).join(' '));
    if (WHEN_LABELS[when]) tile.append(element('span', 'schedule-when', WHEN_LABELS[when]));
    tile.append(element('span', 'schedule-date', dayLabel(date)));
    if (!entry) { tile.append(element('span', 'schedule-free', 'Fără eveniment')); return tile; }
    const link = element('a', 'schedule-link');
    link.href = cardLink(entry.linked_card);
    link.append(element('strong', 'schedule-event', entry.linked_card));
    if (isFeatured) link.append(element('span', 'schedule-star', '★ Evenimentul săptămânii'));
    tile.append(eventImage(entry), link);
    return tile;
  }

  function featuredCard(date, entry) {
    const card = element('article', 'schedule-featured');
    const body = element('div', 'schedule-featured-body');
    body.append(element('span', 'schedule-featured-badge', 'Evenimentul săptămânii'), element('span', 'schedule-featured-day', dayLabel(date)), element('h3', '', entry.linked_card));
    const description = cardFor(entry.linked_card)?.querySelector('.desc')?.textContent;
    if (description) body.append(element('p', '', description));
    const link = element('a', 'schedule-featured-link', 'Vezi evenimentul');
    link.href = cardLink(entry.linked_card);
    body.append(link);
    card.append(eventImage(entry), body);
    return card;
  }

  function render(start, data) {
    const days = new Map(data.days.map((entry) => [entry.day, entry]));
    if (!days.size) { section.hidden = true; return; }
    range.textContent = rangeLabel(start);
    const featured = data.featured_day && days.get(data.featured_day);
    featuredSlot.replaceChildren(...(featured ? [featuredCard(parseDay(data.featured_day), featured)] : []));
    daysList.replaceChildren(...dayOrder(start, new Date()).map(({ date, when }) => {
      const iso = isoDay(date);
      return dayTile(date, days.get(iso), iso === data.featured_day, when);
    }));
    section.hidden = false;
  }

  async function reload() {
    const start = weekStart(new Date());
    try { render(start, await fetchWeek(start)); }
    catch (error) { console.error('Weekly programme failed to load:', error); section.hidden = true; }
  }

  window.PlayersSchedule = { reload, fetchWeek, defaultImage, weekStart, addDays, isoDay, parseDay, dayLabel, rangeLabel };
  reload().then(() => {
    if (location.hash === '#program' && !section.hidden) section.scrollIntoView({ block: 'start' });
  });
})();
