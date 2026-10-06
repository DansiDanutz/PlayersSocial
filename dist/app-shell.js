// App shell: the single "Meniu" button with submenus, the "Install App" button and the service worker.
// Install: where the browser supports it (Chrome/Edge on Android, Windows, macOS) the button opens the native
// install prompt. Chrome only allows it after some use of the site, so an early tap waits a few seconds for it.
// Browsers that never allow sites to start the install (Samsung Internet 27+, Safari, Firefox) get the exact
// steps for that browser; Samsung users also get a one-tap "install with Chrome" link.
// Account state arrives through the "players:account" event dispatched by the main inline script.
(() => {
  const menu = document.getElementById('siteMenu');
  const menuToggle = document.getElementById('menuToggle');
  const installButton = document.getElementById('installApp');
  const menuInstall = document.getElementById('menuInstall');
  const installHelp = document.getElementById('installHelp');
  // The sign-in may finish before this script loads: start from the last announced state.
  let account = window.playersAccount || { signedIn: false, isAdmin: false, name: '' };
  let installPrompt = null;

  // ---------- menu ----------
  function openMenu() { menu.showModal(); menuToggle.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { if (menu.open) menu.close(); }
  menu.addEventListener('close', () => menuToggle.setAttribute('aria-expanded', 'false'));
  menuToggle.addEventListener('click', openMenu);
  menu.querySelector('.menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('click', (event) => { if (event.target === menu) closeMenu(); });
  // Only one submenu open at a time keeps the menu short on phones.
  menu.querySelectorAll('details.menu-group').forEach((group) => group.addEventListener('toggle', () => {
    if (group.open) menu.querySelectorAll('details.menu-group').forEach((other) => { if (other !== group && other.id !== 'menuAccountGroup') other.open = false; });
  }));

  function goTo(selector) {
    closeMenu();
    const target = document.querySelector(selector);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  menu.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    history.replaceState(null, '', link.getAttribute('href'));
    goTo(link.getAttribute('href'));
  }));
  menu.querySelectorAll('[data-menu-filter]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector(`.filter[data-filter="${button.dataset.menuFilter}"]`)?.click();
    goTo('#events');
  }));
  menu.querySelectorAll('[data-menu-video]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector(`#videoTabs [data-category="${button.dataset.menuVideo}"]`)?.click();
    goTo('#videos');
  }));
  document.getElementById('menuLogin').addEventListener('click', () => { closeMenu(); document.getElementById('adminLogin').click(); });
  // The header Login button signs out when someone is signed in (it is hidden then, but still wired).
  document.getElementById('menuLogout').addEventListener('click', () => { closeMenu(); document.getElementById('adminLogin').click(); });
  document.getElementById('menuAdmin').addEventListener('click', () => { closeMenu(); document.getElementById('adminToggle').click(); });

  // ---------- install ----------
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const PROMPT_WAIT_MS = 3500;
  function platform() {
    const agent = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/SamsungBrowser/.test(agent)) return 'samsung';
    if (/Android/.test(agent)) return /Firefox/.test(agent) ? 'firefox' : 'android';
    if (/Macintosh/.test(agent) && /Safari/.test(agent) && !/Chrome|Chromium|Edg/.test(agent)) return 'mac-safari';
    return 'other';
  }
  // Chromium browsers can fire the install event a little after the tap; wait briefly for it.
  function waitForPrompt(milliseconds) {
    if (installPrompt) return Promise.resolve(installPrompt);
    return new Promise((resolve) => {
      const onPrompt = () => { clearTimeout(timer); resolve(installPrompt); };
      const timer = setTimeout(() => { window.removeEventListener('beforeinstallprompt', onPrompt); resolve(null); }, milliseconds);
      window.addEventListener('beforeinstallprompt', onPrompt, { once: true });
    });
  }
  async function isAlreadyInstalled() {
    if (!navigator.getInstalledRelatedApps) return false;
    try { return (await navigator.getInstalledRelatedApps()).length > 0; } catch { return false; }
  }
  function showInstallHelp(kind) {
    installHelp.querySelector('.install-installed').hidden = kind !== 'installed';
    const known = [...installHelp.querySelectorAll('.install-steps')].some((steps) => steps.dataset.platform === kind);
    installHelp.querySelectorAll('.install-steps').forEach((steps) => { steps.hidden = steps.dataset.platform !== (known ? kind : 'other') || kind === 'installed'; });
    installHelp.querySelector('.install-open-chrome').href = `intent://${location.host}${location.pathname}#Intent;scheme=${location.protocol.replace(':', '')};package=com.android.chrome;end`;
    if (!installHelp.open) installHelp.showModal();
  }
  function refresh() {
    const showInstall = account.signedIn && !isInstalled();
    installButton.hidden = !showInstall;
    menuInstall.hidden = !showInstall;
    document.getElementById('menuLogin').hidden = account.signedIn;
    document.getElementById('menuLogout').hidden = !account.signedIn;
    document.getElementById('menuAdmin').hidden = !account.isAdmin;
    const label = document.getElementById('menuAccount');
    label.hidden = !account.signedIn;
    label.textContent = account.signedIn ? `Conectat ca ${account.name}` : '';
  }
  async function runPrompt(prompt) {
    installPrompt = null;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    refresh();
  }
  async function install() {
    closeMenu();
    if (installPrompt) { await runPrompt(installPrompt); return; }
    if (await isAlreadyInstalled()) { showInstallHelp('installed'); return; }
    const current = platform();
    if (current === 'android' || current === 'other') {
      const label = installButton.textContent;
      installButton.textContent = 'Se pregătește…';
      const prompt = await waitForPrompt(PROMPT_WAIT_MS);
      installButton.textContent = label;
      if (prompt) { await runPrompt(prompt); return; }
    }
    showInstallHelp(current);
  }
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault?.(); installPrompt = event; refresh(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; refresh(); });
  installButton.addEventListener('click', install);
  menuInstall.addEventListener('click', install);
  installHelp.querySelector('.install-help-close').addEventListener('click', () => installHelp.close());
  installHelp.addEventListener('click', (event) => { if (event.target === installHelp) installHelp.close(); });

  window.addEventListener('players:account', (event) => { account = event.detail; refresh(); });
  refresh();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.error('Service worker registration failed:', error));
  }
})();
