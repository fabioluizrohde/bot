// Utilitários para interagir com a página da Shopee como se fosse uma pessoa.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 8000, interval = 150) {
    const end = Date.now() + timeout;
    for (;;) {
      let v = null;
      try {
        v = fn();
      } catch (_) {
        v = null;
      }
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(interval);
    }
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
  }

  function text(el) {
    return (el && (el.innerText || el.textContent) || '').trim();
  }

  function realClick(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      button: 0,
    };
    const P = window.PointerEvent || MouseEvent;
    el.dispatchEvent(new P('pointerover', base));
    el.dispatchEvent(new P('pointerdown', { ...base, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', base));
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    el.dispatchEvent(new P('pointerup', { ...base, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.dispatchEvent(new MouseEvent('click', base));
  }

  // Preenche inputs controlados por React/Vue (precisa do setter nativo).
  function typeInto(el, value) {
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, value);
      return;
    }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pressKey(el, key) {
    const opts = { key, code: key, bubbles: true, cancelable: true };
    if (key === 'Enter') Object.assign(opts, { keyCode: 13, which: 13 });
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  const CLICKABLE = 'button, [role=button], a, label, input[type=checkbox], input[type=radio], [role=checkbox], [tabindex]';

  // Acha o menor elemento clicável dentro de "root" cujo texto casa com "pattern".
  function findClickableByText(root, pattern) {
    const re = pattern instanceof RegExp ? pattern : new RegExp('^\\s*' + escapeRe(pattern) + '\\s*$', 'i');
    const pool = [...root.querySelectorAll(CLICKABLE + ', span, div')].filter(
      (e) => visible(e) && text(e).length < 40 && re.test(text(e))
    );
    if (!pool.length) return null;
    // prefere o mais "fundo" (sem filhos que também casam)
    const leaf = pool.filter((e) => !pool.some((o) => o !== e && e.contains(o)));
    const pick = leaf[0] || pool[0];
    return pick.closest(CLICKABLE) || pick;
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Elementos "tag" cuja classe contém o prefixo (as classes da Shopee têm sufixo com hash).
  function qPrefix(rootEl, tag, prefix) {
    return [...rootEl.querySelectorAll(`${tag}[class*="${prefix}"]`)];
  }

  // Espera "fn" ficar falsa (ex.: um modal fechar). true se sumiu, false se estourou o tempo.
  async function waitGone(fn, timeout = 8000, interval = 150) {
    const end = Date.now() + timeout;
    for (;;) {
      let v = null;
      try {
        v = fn();
      } catch (_) {
        v = null;
      }
      if (!v) return true;
      if (Date.now() > end) return false;
      await sleep(interval);
    }
  }

  // Rola o contêiner em passos até "probe()" ser verdadeiro ou chegar ao fim. Devolve o resultado do probe.
  async function scrollUntil(scroller, probe, maxSteps = 40) {
    if (probe()) return true;
    for (let i = 0; i < maxSteps; i++) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + Math.max(scroller.clientHeight * 0.8, 200);
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(250);
      if (probe()) return true;
      if (scroller.scrollTop === before) return false; // chegou ao fim
    }
    return !!probe();
  }

  SLA.dom = { sleep, waitFor, visible, text, realClick, typeInto, pressKey, findClickableByText, escapeRe, CLICKABLE, qPrefix, waitGone, scrollUntil };
})(typeof window !== 'undefined' ? window : globalThis);
