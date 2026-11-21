// Role icons for every account: Dealer (playing card), Șef de sală (clipboard), Super Admin (crown).
// One account can hold several roles; icons always appear in that order. Used by the staff pages, the team
// board, the admin directory and the home page menu. Roles come from players_my_roles / players_staff_board /
// players_admin_staff_directory (migration 20261122120000_players_roles.sql).
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const ROLES = [
    { key: 'dealer', label: 'Dealer', paths: ['M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M12 7.5c-1.6 1.8-3 2.8-3 4.2a1.7 1.7 0 0 0 3 1.1 1.7 1.7 0 0 0 3-1.1c0-1.4-1.4-2.4-3-4.2z', 'M12 13v3'] },
    { key: 'floor', label: 'Șef de sală', paths: ['M8 4h8v3H8z', 'M16 5h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1', 'm9 14 2 2 4-4'] },
    { key: 'admin', label: 'Super Admin', paths: ['M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z', 'M5 19h14'] },
  ];

  function icon(role) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    role.paths.forEach(d => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    });
    return svg;
  }

  // roles: { dealer, floor, admin } booleans. withLabels shows the role name next to each icon.
  function render(roles, { withLabels = false } = {}) {
    const held = ROLES.filter(role => roles && roles[role.key]);
    const list = document.createElement('span');
    list.className = `role-icons${withLabels ? ' labelled' : ''}`;
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', held.length ? `Roluri: ${held.map(role => role.label).join(', ')}` : 'Fără rol');
    held.forEach(role => {
      const item = document.createElement('span');
      item.className = `role-icon ${role.key}`;
      item.setAttribute('role', 'listitem');
      item.title = role.label;
      item.append(icon(role));
      if (withLabels) item.append(Object.assign(document.createElement('span'), { textContent: role.label }));
      else item.append(Object.assign(document.createElement('span'), { className: 'sr-only', textContent: role.label }));
      list.append(item);
    });
    return list;
  }

  window.PlayersRoles = { render, ROLES: ROLES.map(({ key, label }) => ({ key, label })) };
})();
