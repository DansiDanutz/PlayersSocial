// Staff navigation, the same on every staff page (styles in nav.css):
// - one fixed set of links in a fixed order, filtered by the account's roles once they are known
//   (a dealer never sees "Șef de sală"; a floor manager without a dealer card does not see "Cardul meu");
// - desktop: links in the header; phones and tablets (≤ 900px): the same links as a bottom tab bar;
// - the account (email, home page, sign out) sits behind one account button instead of loose header items.
(function () {
  const header = document.querySelector('.topbar, .toolbar');
  if (!header || header.querySelectorAll('a[href^="/"]').length < 2) return;

  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const LINKS = [
    { href: '/dealer/', label: 'Cardul meu', show: r => r.dealer || !r.floor,
      icon: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M12 8.5c-1.6 1.6-2.6 2.7-2.6 3.8a1.6 1.6 0 0 0 2.6 1.2 1.6 1.6 0 0 0 2.6-1.2c0-1.1-1-2.2-2.6-3.8Z"/><path d="M12 13.5V16"/>') },
    { href: '/sef-de-sala/', label: 'Șef de sală', show: r => r.floor,
      icon: svg('<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3.5h6v1"/><path d="m9 12.5 2.2 2.2L15.5 10"/>') },
    { href: '/echipa/', label: 'Echipa', show: r => r.dealer || r.floor,
      icon: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.6c2.4-.3 4.1 1.2 4.6 4"/>') },
    { href: '/dealers-payout/', label: 'Regulament', show: () => true,
      icon: svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 15.5h5"/>') },
    { href: '/cum-functioneaza/', label: 'Ghid', show: () => true,
      icon: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.4"/><path d="M12 17h.01"/>') },
  ];
  const here = location.pathname.replace(/index\.html$/, '');

  function link(item, withIcon) {
    const anchor = document.createElement('a');
    anchor.href = item.href;
    anchor.dataset.href = item.href;
    if (withIcon) anchor.innerHTML = item.icon;
    anchor.append(Object.assign(document.createElement('span'), { textContent: item.label }));
    if (item.href === here) anchor.setAttribute('aria-current', 'page');
    return anchor;
  }

  // Header links: the page's own static links are replaced by the shared set (download/print buttons stay).
  header.querySelectorAll('a[href^="/"]').forEach(anchor => anchor.remove());
  const headerNav = Object.assign(document.createElement('nav'), { className: 'site-links' });
  headerNav.setAttribute('aria-label', 'Meniu personal');
  LINKS.forEach(item => headerNav.append(link(item, false)));
  const brand = header.querySelector('strong, span');
  if (brand) brand.after(headerNav); else header.prepend(headerNav);

  const tabbar = Object.assign(document.createElement('nav'), { className: 'tabbar' });
  tabbar.setAttribute('aria-label', 'Navigare personal');
  LINKS.forEach(item => tabbar.append(link(item, true)));
  document.body.append(tabbar);

  function applyRoles(roles) {
    if (!roles) return;
    LINKS.forEach(item => {
      document.querySelectorAll(`.site-links a[data-href="${item.href}"], .tabbar a[data-href="${item.href}"]`).forEach(anchor => { anchor.hidden = !item.show(roles); });
    });
    tabbar.style.setProperty('--tabs', String(LINKS.filter(item => item.show(roles)).length));
  }
  document.addEventListener('staff:roles', event => applyRoles(event.detail));
  applyRoles(window.staffRoles);

  // Account button: email, home page and sign-out in one menu (pages keep filling #who and showing #signOut).
  const who = header.querySelector('#who');
  const signOut = header.querySelector('#signOut');
  if (!who && !signOut) return;
  const account = Object.assign(document.createElement('div'), { className: 'account' });
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'account-btn' });
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Contul meu');
  button.innerHTML = '<span class="avatar" aria-hidden="true"></span>' + svg('<path d="m7 10 5 5 5-5"/>');
  const menu = Object.assign(document.createElement('div'), { className: 'account-menu', id: 'accountMenu', hidden: true });
  button.setAttribute('aria-controls', menu.id);
  const home = Object.assign(document.createElement('a'), { href: '/', textContent: 'Pagina principală' });
  if (who) menu.append(who);
  menu.append(home);
  if (signOut) menu.append(signOut);
  account.append(button, menu);
  header.append(account);

  const avatar = button.querySelector('.avatar');
  const syncAccount = () => {
    const email = who ? who.textContent.trim() : '';
    account.hidden = !email;
    avatar.textContent = email ? email[0].toUpperCase() : '';
    if (email) button.setAttribute('aria-label', `Contul meu: ${email}`);
  };
  if (who) new MutationObserver(syncAccount).observe(who, { childList: true, characterData: true, subtree: true });
  syncAccount();

  const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => { if (!account.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
})();
