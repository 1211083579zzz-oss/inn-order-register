(function () {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.22,1,.36,1)';
  const content = new Map();
  const disclosures = new Map();

  function stopContent(element) {
    const animation = content.get(element);
    content.delete(element);
    animation?.cancel();
    delete element.dataset.contentMotion;
  }

  function change(targets, update, direction = 0) {
    const elements = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === 'string' ? document.querySelector(target) : target).filter(Boolean);
    elements.forEach(stopContent);
    // Data and controls update in the same task; motion never delays a selection.
    update();
    if (reduced.matches || document.hidden) return;
    for (const element of elements) {
      if (!element.getClientRects().length || !element.offsetHeight) continue;
      const animation = element.animate([
        { opacity: .78, transform: `translate3d(${direction * 10}px,4px,0)` },
        { opacity: 1, transform: 'translate3d(0,0,0)' }
      ], { duration: 200, easing: ease });
      content.set(element, animation);
      element.dataset.contentMotion = 'running';
      animation.finished.then(() => { if (content.get(element) === animation) { content.delete(element); delete element.dataset.contentMotion; } }).catch(() => {});
    }
  }

  function settleDisclosure(details, expanded) {
    const state = disclosures.get(details);
    if (!state) return;
    disclosures.delete(details);
    state.animation?.cancel();
    details.open = expanded;
    state.summary.setAttribute('aria-expanded', String(expanded));
    state.body.style.removeProperty('height');
    state.body.style.removeProperty('overflow');
    state.body.inert = false;
    state.body.removeAttribute('aria-hidden');
    delete details.dataset.disclosureState;
  }

  function toggleDisclosure(details, summary, body) {
    const previous = disclosures.get(details);
    const expanded = !(previous?.expanded ?? details.open);
    const from = details.open ? body.getBoundingClientRect().height : 0;
    if (previous) settleDisclosure(details, details.open);
    if (!expanded && body.contains(document.activeElement)) summary.focus({ preventScroll: true });
    details.open = true;
    body.inert = !expanded;
    if (expanded) body.removeAttribute('aria-hidden');
    else body.setAttribute('aria-hidden', 'true');
    const height = body.scrollHeight;
    body.style.height = `${expanded ? height : 0}px`;
    body.style.overflow = 'hidden';
    summary.setAttribute('aria-expanded', String(expanded));
    details.dataset.disclosureState = expanded ? 'opening' : 'closing';
    // Only this small disclosure participates in layout; its size is read once.
    const animation = body.animate([
      { height: `${from}px`, opacity: expanded ? .6 : 1 },
      { height: `${expanded ? height : 0}px`, opacity: expanded ? 1 : .6 }
    ], { duration: expanded ? 240 : 190, easing: ease });
    const state = { expanded, body, summary, animation };
    disclosures.set(details, state);
    animation.finished.then(() => { if (disclosures.get(details) === state) settleDisclosure(details, expanded); }).catch(() => {});
  }

  for (const details of document.querySelectorAll('#own-company-settings, #own-anchor-totals, #company-billing')) {
    const summary = details.querySelector(':scope > summary');
    if (!summary) continue;
    const body = document.createElement('div');
    body.className = 'disclosure-body';
    while (summary.nextSibling) body.append(summary.nextSibling);
    details.append(body);
    summary.setAttribute('aria-expanded', String(details.open));
    summary.addEventListener('click', event => {
      if (event.defaultPrevented || event.button > 0 || event.target.closest('a, button, input')) return;
      if (reduced.matches) return;
      event.preventDefault();
      toggleDisclosure(details, summary, body);
    });
    details.addEventListener('toggle', () => {
      if (!details.open) settleDisclosure(details, false);
      summary.setAttribute('aria-expanded', String(disclosures.get(details)?.expanded ?? details.open));
    });
  }

  function settleAll() {
    [...content.keys()].forEach(stopContent);
    for (const [details, state] of [...disclosures]) settleDisclosure(details, state.expanded);
  }
  reduced.addEventListener('change', () => { if (reduced.matches) settleAll(); });
  window.addEventListener('pagehide', settleAll);
  window.addEventListener('innviewchange', settleAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settleAll(); });
  window.InnFeedback = { change };
}());
