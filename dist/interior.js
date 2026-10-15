// Vanilla port of interior micro-interactions (https://github.com/ddoemonn/interior, MIT © 2026 ozzy).
// - Async buttons: idle → pending → success | error → idle (~1.4 s). Clicks while pending are ignored, the
//   button carries aria-busy, and its accessible name follows the visible label.
// - Stable labels: every label a button can show sits in one grid cell, so the button never resizes.
// - Tab lists: a complete keyboard implementation (arrows, Home, End) with a roving tabindex.
// - Skeleton swap: placeholders appear only when loading is slow, and then stay long enough not to blink.
// Fades live in interior.css and are skipped under prefers-reduced-motion; the state still changes instantly.
(function (root) {
  const RESET_AFTER_MS = 1400;

  // A result of `false` counts as an error; `null` means "nothing happened" (e.g. a cancelled share sheet).
  function createAsyncAction({ action, onStatus, resetAfter = RESET_AFTER_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let status = 'idle', runId = 0, timer = null;
    const set = (next) => { status = next; onStatus(next); };
    return {
      get status() { return status; },
      async run(...args) {
        if (status === 'pending') return 'ignored';
        clearTimer(timer);
        timer = null;
        const id = ++runId;
        set('pending');
        let outcome;
        try {
          const result = await action(...args);
          outcome = result === false ? 'error' : result === null ? 'idle' : 'success';
        } catch {
          outcome = 'error';
        }
        if (id !== runId) return outcome;
        set(outcome);
        if (outcome !== 'idle') timer = setTimer(() => { if (id === runId) set('idle'); }, resetAfter);
        return outcome;
      },
    };
  }

  function stableLabels(button, labels) {
    const stack = document.createElement('span');
    stack.className = 'interior-faces';
    const faces = new Map();
    for (const key of Object.keys(labels)) {
      const face = document.createElement('span');
      face.className = 'interior-face';
      face.dataset.face = key;
      face.setAttribute('aria-hidden', 'true');
      face.textContent = labels[key];
      faces.set(key, face);
      stack.append(face);
    }
    button.replaceChildren(stack);
    const show = (key) => {
      faces.forEach((face, name) => face.classList.toggle('is-active', name === key));
      button.setAttribute('aria-label', labels[key]);
    };
    show('idle');
    return { show };
  }

  // Labels are registered per selector, so a button reserves room for all of them as soon as it appears
  // (a MutationObserver upgrades it), not on its first click.
  const registry = [];
  function labelsFor(button) {
    const match = registry.find(([selector]) => button.matches(selector));
    if (!match) return {};
    return typeof match[1] === 'function' ? match[1]() : match[1];
  }
  function upgradeIn(node) {
    if (!node || node.nodeType !== 1) return;
    for (const [selector] of registry) {
      if (node.matches(selector)) actionButton(node);
      node.querySelectorAll(selector).forEach((button) => actionButton(button));
    }
  }
  let observer = null;
  function register(selector, labels) {
    registry.push([selector, labels]);
    if (typeof document === 'undefined') return;
    upgradeIn(document.documentElement);
    if (!observer && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(upgradeIn)));
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  // Turns a button into an async button once; returns run(fn). fn's promise decides success or error.
  const actionButtons = new WeakMap();
  function actionButton(button, labels = labelsFor(button)) {
    let entry = actionButtons.get(button);
    if (!entry) {
      const idle = labels.idle || button.textContent.trim();
      const faces = stableLabels(button, {
        idle,
        pending: labels.pending || idle,
        success: labels.success || idle,
        error: labels.error || idle,
      });
      const action = createAsyncAction({
        action: (fn) => fn(),
        onStatus: (status) => {
          faces.show(status);
          button.dataset.state = status;
          if (status === 'pending') button.setAttribute('aria-busy', 'true');
          else button.removeAttribute('aria-busy');
        },
      });
      entry = { run: (fn) => action.run(fn) };
      actionButtons.set(button, entry);
    }
    return entry.run;
  }

  // Keyboard for role="tablist": arrows move and select, Home/End jump; only the selected tab is in the tab order.
  function syncTabs(tablist) {
    tablist.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    });
  }
  function tabKeys(tablist) {
    if (tablist.dataset.interiorTabs) return;
    tablist.dataset.interiorTabs = 'true';
    tablist.addEventListener('keydown', (event) => {
      const tabs = [...tablist.querySelectorAll('[role="tab"]')].filter((tab) => !tab.hidden && !tab.disabled);
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      const vertical = tablist.getAttribute('aria-orientation') === 'vertical';
      const next = { [vertical ? 'ArrowDown' : 'ArrowRight']: index + 1, [vertical ? 'ArrowUp' : 'ArrowLeft']: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      target.click();
      syncTabs(tablist);
    });
    syncTabs(tablist);
  }

  // Skeleton swap: show `makeCard()` placeholders only if loading outlasts `delay`, keep them `minVisible`.
  function skeletonSwap(list, { makeCard, cards = 3, delay = 120, minVisible = 380, setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now() }) {
    let showTimer = null, settleTimer = null, shownAt = null, pendingPaint = null;
    const finish = () => {
      settleTimer = null;
      shownAt = null;
      list.removeAttribute('aria-busy');
      const paint = pendingPaint;
      pendingPaint = null;
      if (paint) paint();
    };
    return {
      start() {
        if (shownAt !== null || showTimer !== null) return;
        showTimer = setTimer(() => {
          showTimer = null;
          shownAt = now();
          list.setAttribute('aria-busy', 'true');
          list.replaceChildren(...Array.from({ length: cards }, makeCard));
        }, delay);
      },
      settle(paint) {
        clearTimer(showTimer);
        showTimer = null;
        if (shownAt === null) { paint(); return; }
        pendingPaint = paint;
        if (settleTimer !== null) return;
        const rest = Math.max(0, minVisible - (now() - shownAt));
        if (rest === 0) finish();
        else settleTimer = setTimer(finish, rest);
      },
    };
  }

  const api = { createAsyncAction, stableLabels, actionButton, register, tabKeys, syncTabs, skeletonSwap, RESET_AFTER_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Interior = api;
})(typeof window !== 'undefined' ? window : globalThis);
