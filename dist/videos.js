// Video library + promo player. Loaded after the main inline script (uses SUPABASE_URL and authHeaders).
// The Video tab merges two sources: videos shipped with the site (/videos/videos.json) and event videos
// uploaded from the admin dashboard (players_public_videos RPC). Uploaded videos are listed first in their
// category. Promo buttons on the game cards are static markup (data-promo-*), so they work even if both fail.
(() => {
  const TYPE_LABELS = { promo: 'Promo', premium: 'Premium', event: 'Eveniment' };
  const ALL = 'all';
  const tabs = document.getElementById('videoTabs');
  const list = document.getElementById('videoList');
  const status = document.getElementById('videoStatus');
  const dialog = document.getElementById('promoDialog');
  const dialogVideo = dialog.querySelector('video');
  const dialogTitle = dialog.querySelector('.promo-title');

  // ---------- sharing ----------
  // A shared link (?video=<id>) opens the site with that video already playing.
  const shareUrl = (video) => `${location.origin}/?video=${encodeURIComponent(video.id)}`;
  const whatsappHref = (video) => `https://wa.me/?text=${encodeURIComponent(`${video.title} 🎬 ${shareUrl(video)}`)}`;
  async function shareVideo(video, status) {
    const url = shareUrl(video);
    if (navigator.share) {
      try { await navigator.share({ title: video.title, text: `Uită-te la ${video.title} — Players Club`, url }); }
      catch (error) { if (error.name !== 'AbortError') status.textContent = `Copiază linkul: ${url}`; }
      return;
    }
    try { await navigator.clipboard.writeText(url); status.textContent = 'Link copiat. Îl poți lipi oriunde.'; }
    catch { status.textContent = `Copiază linkul: ${url}`; }
  }
  function shareRow(video) {
    const row = element('div', 'share-row'), native = element('button', 'share-native', 'Distribuie'), whatsapp = element('a', 'share-whatsapp', 'WhatsApp'), status = element('p', 'share-status');
    native.type = 'button';
    status.setAttribute('role', 'status');
    native.addEventListener('click', () => shareVideo(video, status));
    whatsapp.href = whatsappHref(video);
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    row.append(native, whatsapp);
    return [row, status];
  }

  // ---------- promo dialog ----------
  function openVideo(video) {
    dialogTitle.textContent = video.title || 'Promo video';
    dialogVideo.poster = video.poster || '';
    dialogVideo.src = video.src;
    dialog.querySelector('.promo-share').replaceChildren(...shareRow(video));
    if (!dialog.open) dialog.showModal();
    dialogVideo.play().catch(() => {});
  }
  const videoFromButton = (button) => ({ id: button.dataset.promoId, title: button.dataset.promoTitle, src: button.dataset.promoSrc, poster: button.dataset.promoPoster });
  function openPromo(button) { openVideo(videoFromButton(button)); }
  function stopPromo() {
    dialogVideo.pause();
    dialogVideo.removeAttribute('src');
    dialogVideo.load();
  }
  document.querySelectorAll('.card-promo-button').forEach((button) => button.addEventListener('click', () => openPromo(button)));
  dialog.querySelector('.promo-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', stopPromo);

  // ---------- library ----------
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function videoCard(video, category) {
    const card = element('article', 'library-video');
    card.id = `video-${video.id}`;
    card.dataset.category = video.category;
    const frame = element('div', 'video-frame');
    const player = element('video');
    Object.assign(player, { controls: true, playsInline: true, preload: 'none', poster: video.poster, src: video.src });
    player.setAttribute('aria-label', `Video: ${video.title}`);
    frame.append(player);
    const info = element('div', 'video-info');
    info.append(element('span', `video-type video-type-${video.type}`, TYPE_LABELS[video.type] || video.type));
    info.append(element('h3', '', video.title));
    if (video.description) info.append(element('p', '', video.description));
    info.append(...shareRow(video));
    if (category && category.card) {
      const link = element('a', 'video-card-link', `Vezi cardul ${category.label}`);
      link.href = category.card;
      info.append(link);
    }
    card.append(frame, info);
    return card;
  }

  function selectTab(id) {
    tabs.querySelectorAll('[role="tab"]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.category === id)));
    list.querySelectorAll('.library-video').forEach((card) => { card.hidden = id !== ALL && card.dataset.category !== id; });
  }

  function tabButton(id, label) {
    const tab = element('button', 'video-tab', label);
    Object.assign(tab, { type: 'button' });
    tab.setAttribute('role', 'tab');
    tab.dataset.category = id;
    tab.addEventListener('click', () => selectTab(id));
    return tab;
  }

  function render({ categories, videos }) {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const used = categories.filter((category) => videos.some((video) => video.category === category.id));
    tabs.replaceChildren(tabButton(ALL, 'Toate'), ...used.map((category) => tabButton(category.id, category.label)));
    list.replaceChildren(...videos.map((video) => videoCard(video, byId.get(video.category))));
    selectTab(ALL);
    status.hidden = true;
    const linked = location.hash.startsWith('#video-') && document.getElementById(location.hash.slice(1));
    if (linked) linked.scrollIntoView({ block: 'start' });
    openSharedVideo(videos);
  }

  // Opens the video named in ?video=<id> once (from the library, or a card's promo button as a fallback).
  let sharedVideoPending = new URLSearchParams(location.search).get('video');
  function openSharedVideo(videos) {
    if (!sharedVideoPending) return;
    const id = sharedVideoPending;
    const video = videos.find((entry) => entry.id === id);
    const button = [...document.querySelectorAll('.card-promo-button')].find((entry) => entry.dataset.promoId === id);
    if (!video && !button) return;
    sharedVideoPending = null;
    openVideo(video || videoFromButton(button));
  }

  async function loadSiteVideos() {
    const response = await fetch('/videos/videos.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`videos.json HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.categories) || !Array.isArray(data.videos)) throw new Error('invalid videos.json');
    return data;
  }

  async function loadUploadedVideos() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/players_public_videos`, { method: 'POST', headers: authHeaders(), body: '{}' });
    if (!response.ok) throw new Error(`players_public_videos HTTP ${response.status}`);
    const rows = await response.json();
    return rows.map((row) => ({ id: row.id, category: row.category, type: row.video_type, title: row.title, description: row.description, src: row.video_url, poster: row.poster_url || '' }));
  }

  // Uploaded videos first within each category, then the site's own; categories keep the videos.json order.
  function merge(site, uploaded) {
    const categories = site ? site.categories : [...new Set(uploaded.map((video) => video.category))].map((id) => ({ id, label: id, card: '' }));
    const siteVideos = site ? site.videos : [];
    const videos = categories.flatMap((category) => [
      ...uploaded.filter((video) => video.category === category.id),
      ...siteVideos.filter((video) => video.category === category.id),
    ]);
    return { categories, videos };
  }

  async function reload() {
    const [site, uploaded] = await Promise.allSettled([loadSiteVideos(), loadUploadedVideos()]);
    if (site.status === 'rejected') console.error('Site videos failed to load:', site.reason);
    if (uploaded.status === 'rejected') console.error('Uploaded videos failed to load:', uploaded.reason);
    if (site.status === 'rejected' && uploaded.status === 'rejected') {
      openSharedVideo([]);
      status.textContent = 'Videoclipurile nu au putut fi încărcate. Reîncarcă pagina.';
      status.hidden = false;
      return;
    }
    render(merge(site.value, uploaded.value || []));
  }

  window.PlayersVideos = { reload };
  reload();
})();
