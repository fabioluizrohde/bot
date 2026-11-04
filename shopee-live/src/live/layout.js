// Painel da live: tamanho e posição padrão, validação e ajuste (funções puras, sem DOM).
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const MIN_W = 300;
  const MIN_H = 280;
  const DEFAULT_W = 440;
  const DEFAULT_H_RATIO = 0.85;
  const MARGIN = 16;
  const TOP = 64;
  const VISIVEL_X = 80; // largura mínima do painel que fica dentro da janela
  const VISIVEL_Y = 40; // o cabeçalho (topo) precisa ficar a pelo menos isto do fundo

  function clamp(n, lo, hi) {
    return Math.min(Math.max(n, lo), Math.max(lo, hi));
  }

  function dimJanela(win) {
    const w = Math.floor(Number(win && win.innerWidth));
    const h = Math.floor(Number(win && win.innerHeight));
    return { w: Number.isFinite(w) && w > 0 ? w : MIN_W, h: Number.isFinite(h) && h > 0 ? h : MIN_H };
  }

  function defaultRect(win) {
    const { w: W, h: H } = dimJanela(win);
    const width = Math.min(W, Math.max(MIN_W, Math.min(DEFAULT_W, W - 2 * MARGIN)));
    const height = Math.min(H, Math.max(MIN_H, Math.min(Math.floor(DEFAULT_H_RATIO * H), H - TOP - MARGIN)));
    return {
      left: Math.max(0, W - width - MARGIN),
      top: Math.max(0, Math.min(TOP, H - height)),
      width,
      height,
    };
  }

  function sanitizeRect(saved, win) {
    const campos = ['left', 'top', 'width', 'height'];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaultRect(win);
    for (const k of campos) {
      if (typeof saved[k] !== 'number' || !Number.isFinite(saved[k])) return defaultRect(win);
    }
    const { w: W, h: H } = dimJanela(win);
    const width = clamp(Math.round(saved.width), Math.min(MIN_W, W), W);
    const height = clamp(Math.round(saved.height), Math.min(MIN_H, H), H);
    return {
      left: clamp(Math.round(saved.left), VISIVEL_X - width, W - VISIVEL_X),
      top: clamp(Math.round(saved.top), 0, H - VISIVEL_Y),
      width,
      height,
    };
  }

  function rectAfterMove(rect, dx, dy, win) {
    return sanitizeRect({ ...rect, left: rect.left + dx, top: rect.top + dy }, win);
  }

  function rectAfterResize(rect, dw, dh, win) {
    return sanitizeRect({ ...rect, width: rect.width + dw, height: rect.height + dh }, win);
  }

  function loteMaxHeight(panelHeight) {
    if (!Number.isFinite(panelHeight)) return 80;
    return Math.max(80, Math.floor(0.35 * panelHeight));
  }

  SLA.layout = {
    MIN_W, MIN_H, DEFAULT_W, DEFAULT_H_RATIO, MARGIN, TOP,
    defaultRect, sanitizeRect, rectAfterMove, rectAfterResize, loteMaxHeight,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.layout;
})(typeof window !== 'undefined' ? window : globalThis);
