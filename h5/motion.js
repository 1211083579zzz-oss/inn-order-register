(function () {
  'use strict';

  window.createInnNavigation = function (home, overlays) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const session = `inn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const views = new Map(overlays.map(view => [view.id, view]));
    const ease = 'cubic-bezier(.32,.72,0,1)';
    let active = null;
    let savedFocus;
    let savedScroll = 0;
    let bodyStyles;
    let gesture = null;
    let historyPending = false;
    let generation = 0;
    let animations = [];
    let skipClick = false;
    const stack = [];
    let requestedStack = null;

    history.replaceState({ ...history.state, innSession: session, innView: null, innStack: [], innConfirm: null }, '');

    function underlay(view) { return stack.find(entry => entry.id === view.id)?.underlay || home; }
    function announce() {
      const current = stack[stack.length - 1];
      window.dispatchEvent(new CustomEvent('innviewchange', { detail: { id: current?.id || null, context: current?.context || {} } }));
    }

    function reconcileHistory() {
      if (!requestedStack || active?.dataset.state === 'closing') return;
      const matches = stack.every((entry, index) => requestedStack[index]?.id === entry.id && JSON.stringify(requestedStack[index]?.context || {}) === JSON.stringify(entry.context));
      if (stack.length > requestedStack.length || !matches) {
        if (active) close(active.id, true);
      } else if (stack.length < requestedStack.length) {
        const next = requestedStack[stack.length];
        if (views.has(next.id)) open(next.id, next.context || {}, true);
        else requestedStack = null;
      } else requestedStack = null;
    }

    function syncViewport() {
      if (!active) return;
      const viewport = window.visualViewport;
      // WeChat chrome can reduce the usable viewport without opening a keyboard.
      // Keep the existing layout during pinch zoom so zooming does not reflow the form.
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      active.style.setProperty('--visual-height', `${Math.max(1, viewport?.height || innerHeight)}px`);
      active.style.setProperty('--visual-top', `${viewport?.offsetTop || 0}px`);
    }

    function geometry(view, progress) {
      const sheet = view.dataset.presentation === 'sheet';
      const mobile = innerWidth < 700;
      const distance = sheet ? view.querySelector('.page-panel').offsetHeight + 24 : view.querySelector('.page-panel').offsetWidth;
      return {
        panel: sheet ? `translate3d(0,${distance * progress}px,0)` : `translate3d(${distance * progress}px,0,0)`,
        home: sheet ? `translate3d(0,${8 * (1 - progress)}px,0) scale(${1 - .035 * (1 - progress)})` : `translate3d(${-Math.min(innerWidth, 960) * (mobile ? .27 : 0) * (1 - progress)}px,0,0)`,
        shade: (sheet ? .24 : .12) * (1 - progress)
      };
    }

    function setProgress(view, progress) {
      const frame = geometry(view, progress);
      view.querySelector('.page-panel').style.transform = frame.panel;
      view.querySelector('.view-dimmer').style.opacity = frame.shade;
      underlay(view).style.transform = frame.home;
      view.dataset.progress = progress.toFixed(3);
    }

    function stopAnimations() {
      generation += 1;
      animations.forEach(animation => animation.cancel());
      animations = [];
    }

    function animate(view, from, to, duration, state, done) {
      stopAnimations();
      const token = generation;
      view.dataset.state = state;
      setProgress(view, to);
      if (reducedMotion.matches) { done(); return; }
      const first = geometry(view, from);
      const last = geometry(view, to);
      const options = { duration, easing: ease, fill: 'none' };
      animations = [
        view.querySelector('.page-panel').animate([{ transform: first.panel }, { transform: last.panel }], options),
        view.querySelector('.view-dimmer').animate([{ opacity: first.shade }, { opacity: last.shade }], options),
        underlay(view).animate([{ transform: first.home }, { transform: last.home }], options)
      ];
      Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (token !== generation) return;
        animations = [];
        done();
      }).catch(() => { /* A new drag, resize, or reduced-motion preference owns the next frame. */ });
    }

    function lockHome() {
      savedScroll = scrollY;
      savedFocus = document.activeElement;
      savedFocus?.blur();
      bodyStyles = Object.fromEntries(['position', 'top', 'left', 'right', 'width'].map(key => [key, document.body.style[key]]));
      Object.assign(document.body.style, { position: 'fixed', top: `${-savedScroll}px`, left: '0', right: '0', width: '100%' });
      home.style.transformOrigin = `50% ${savedScroll + 20}px`;
      home.inert = true;
      document.body.classList.add('modal-open');
    }

    function finishClose(view) {
      stopAnimations();
      const entry = stack.pop();
      view.hidden = true;
      view.inert = false;
      view.dataset.state = 'closed';
      view.dataset.progress = '1.000';
      view.querySelector('.page-panel').style.removeProperty('transform');
      view.querySelector('.view-dimmer').style.removeProperty('opacity');
      entry.underlay.style.removeProperty('transform');
      entry.underlay.style.removeProperty('transform-origin');
      entry.underlay.classList.remove('sheet-underlay');
      active = stack.length ? views.get(stack[stack.length - 1].id) : null;
      if (active) active.inert = false;
      else {
        home.inert = false;
        document.body.classList.remove('modal-open');
        Object.assign(document.body.style, bodyStyles);
        window.scrollTo(0, savedScroll);
      }
      gesture = null;
      const sourceFocus = entry.opener || savedFocus;
      const focus = sourceFocus?.isConnected && sourceFocus.tabIndex >= 0 ? sourceFocus : active?.querySelector('h2') || home.querySelector('.home-toolbar button:not([hidden])');
      focus?.focus({ preventScroll: true });
      announce();
      reconcileHistory();
    }

    function open(id, context = {}, fromHistory = false) {
      if (historyPending || !views.has(id) || stack.some(entry => entry.id === id) || (active && active.dataset.state !== 'open')) return;
      const view = views.get(id);
      const parent = active;
      const opener = document.activeElement;
      if (!parent) lockHome();
      else { parent.inert = true; opener?.blur(); }
      const beneath = parent ? parent.querySelector('.page-panel') : home;
      stack.push({ id, context, underlay: beneath, opener });
      active = view;
      view.style.zIndex = String(20 + stack.length);
      view.hidden = false;
      view.inert = false;
      beneath.classList.toggle('sheet-underlay', view.dataset.presentation === 'sheet');
      view.querySelector('.view-scroll').scrollTop = 0;
      syncViewport();
      if (!fromHistory) history.pushState({ ...history.state, innSession: session, innView: id, innStack: stack.map(entry => ({ id: entry.id, context: entry.context })), innConfirm: null }, '');
      announce();
      view.querySelector('h2').focus({ preventScroll: true });
      animate(view, 1, 0, view.dataset.presentation === 'sheet' ? 380 : 360, 'opening', () => { view.dataset.state = 'open'; reconcileHistory(); });
    }

    function visibleProgress(view) {
      const panel = view.querySelector('.page-panel');
      const matrix = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
      const sheet = view.dataset.presentation === 'sheet';
      return Math.max(0, Math.min(1, (sheet ? matrix.m42 : matrix.m41) / (sheet ? panel.offsetHeight + 24 : panel.offsetWidth)));
    }

    function close(id, fromHistory = false, fromProgress = null) {
      const view = views.get(id);
      if (active !== view || view.dataset.state === 'closing') return;
      const progress = fromProgress === null ? visibleProgress(view) : fromProgress;
      if (!fromHistory && history.state?.innSession === session && history.state?.innView === id) {
        historyPending = true;
        history.back();
      }
      document.activeElement?.blur();
      view.inert = true;
      gesture = null;
      animate(view, progress, 1, Math.max(160, 300 * (1 - progress)), 'closing', () => finishClose(view));
    }

    function startGesture(event) {
      if (!active || active.dataset.state !== 'open' || reducedMotion.matches || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const sheet = active.dataset.presentation === 'sheet';
      const target = event.target;
      if (sheet ? !target.closest('.sheet-grabber, .view-nav') || target.closest('button') : event.clientX > 28 || target.closest('input, textarea, select, button, a')) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, previous: sheet ? event.clientY : event.clientX, time: performance.now(), velocity: 0, progress: 0, dragging: false, sheet };
    }

    function moveGesture(event) {
      if (!gesture || event.pointerId !== gesture.id || !active) return;
      const main = gesture.sheet ? event.clientY - gesture.y : event.clientX - gesture.x;
      const cross = gesture.sheet ? event.clientX - gesture.x : event.clientY - gesture.y;
      if (!gesture.dragging && Math.abs(cross) > 9 && Math.abs(cross) > Math.abs(main)) { gesture = null; return; }
      if (!gesture.dragging && main < 5) return;
      if (!gesture.dragging) {
        gesture.dragging = true;
        active.setPointerCapture(event.pointerId);
        active.dataset.state = 'dragging';
      }
      if (event.cancelable) event.preventDefault();
      const position = gesture.sheet ? event.clientY : event.clientX;
      const now = performance.now();
      const elapsed = now - gesture.time;
      if (elapsed > 0) gesture.velocity = (position - gesture.previous) / elapsed;
      gesture.previous = position;
      gesture.time = now;
      const distance = gesture.sheet ? active.querySelector('.page-panel').offsetHeight + 24 : active.querySelector('.page-panel').offsetWidth;
      gesture.progress = Math.max(0, Math.min(1, main / distance));
      setProgress(active, gesture.progress);
    }

    function endGesture(event, canceled = false) {
      if (!gesture || event.pointerId !== gesture.id || !active) return;
      const drag = gesture;
      gesture = null;
      if (!drag.dragging) return;
      if (active.hasPointerCapture(event.pointerId)) active.releasePointerCapture(event.pointerId);
      skipClick = true;
      setTimeout(() => { skipClick = false; }, 0);
      const recentVelocity = performance.now() - drag.time < 100 ? drag.velocity : 0;
      if (!canceled && (drag.progress > .34 || (drag.progress > .06 && recentVelocity > .55))) {
        close(active.id, false, drag.progress);
      } else {
        const view = active;
        animate(view, drag.progress, 0, 260, 'settling', () => { view.dataset.state = 'open'; });
      }
    }

    overlays.forEach(view => {
      view.addEventListener('pointerdown', startGesture);
      view.addEventListener('pointermove', moveGesture, { passive: false });
      view.addEventListener('pointerup', event => endGesture(event));
      view.addEventListener('pointercancel', event => endGesture(event, true));
      view.addEventListener('click', event => {
        if (skipClick) { event.preventDefault(); event.stopImmediatePropagation(); }
        else if (event.target.classList.contains('view-dimmer')) close(view.id);
      }, true);
    });

    window.addEventListener('popstate', event => {
      historyPending = false;
      requestedStack = event.state?.innSession === session ? event.state.innStack || [] : [];
      reconcileHistory();
    });
    window.addEventListener('resize', () => {
      if (!active) return;
      syncViewport();
      if (active.dataset.state === 'closing') { finishClose(active); return; }
      stopAnimations();
      gesture = null;
      setProgress(active, 0);
      active.dataset.state = 'open';
    });
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    reducedMotion.addEventListener('change', () => {
      if (!active || !reducedMotion.matches) return;
      if (active.dataset.state === 'closing') finishClose(active);
      else { stopAnimations(); gesture = null; setProgress(active, 0); active.dataset.state = 'open'; }
    });

    return { open, close };
  };
}());
