// Phones: the staff header links also appear as an app-style tab bar at the bottom of the screen (staff.css shows
// one or the other by width, so only one set is ever visible or in the accessibility tree).
(function () {
  const header = document.querySelector('.topbar');
  const links = header ? [...header.querySelectorAll('a[href]')] : [];
  if (links.length < 3) return;

  const path = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    '/dealer/': path('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M12 8.5c-1.6 1.6-2.6 2.7-2.6 3.8a1.6 1.6 0 0 0 2.6 1.2 1.6 1.6 0 0 0 2.6-1.2c0-1.1-1-2.2-2.6-3.8Z"/><path d="M12 13.5V16"/>'),
    '/echipa/': path('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.6c2.4-.3 4.1 1.2 4.6 4"/>'),
    '/sef-de-sala/': path('<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3.5h6v1"/><path d="m9 12.5 2.2 2.2L15.5 10"/>'),
    '/dealers-payout/': path('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 15.5h5"/>'),
    '/cum-functioneaza/': path('<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.4"/><path d="M12 17h.01"/>'),
  };
  const here = location.pathname.replace(/index\.html$/, '');

  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Navigare personal');
  links.forEach(link => {
    const href = link.getAttribute('href');
    const item = document.createElement('a');
    item.href = href;
    item.innerHTML = ICONS[href] || '';
    const label = document.createElement('span');
    label.textContent = link.textContent.trim();
    item.append(label);
    if (href === here) item.setAttribute('aria-current', 'page');
    nav.append(item);
  });
  document.body.append(nav);
})();
