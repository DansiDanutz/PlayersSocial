// App shell: the single "Meniu" button with submenus, the "Install App" button and the service worker.
// Install: where the browser supports it (Chrome/Edge on Android, Windows, macOS) the button opens the native
// install prompt; elsewhere (iPhone/iPad, Safari on Mac, Firefox) it shows the two steps to add the app.
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
  function platform() {
    const agent = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Macintosh/.test(agent) && /Safari/.test(agent) && !/Chrome|Chromium|Edg/.test(agent)) return 'mac-safari';
    return 'other';
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
  async function install() {
    closeMenu();
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      await prompt.userChoice.catch(() => null);
      refresh();
      return;
    }
    const current = platform();
    installHelp.querySelectorAll('.install-steps').forEach((steps) => { steps.hidden = steps.dataset.platform !== current; });
    installHelp.showModal();
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
