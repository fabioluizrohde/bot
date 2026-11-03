// Coordenador do lote: guarda o estado em chrome.storage.session e comanda a
// aba/janela da Shopee. Recebe as dependências (storage, tabs, windows) por
// parâmetro para poder ser testado sem o chrome.* de verdade.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});
  const SHOPEE_URL = 'https://shopee.com.br/';

  function createCoordinator(deps) {
    const { storage, tabs, windows } = deps;
    const B = () => root.SLA.batch;

    // Uma mensagem por vez, para duas respostas seguidas não se atropelarem.
    let fila = Promise.resolve();

    async function getBatch() {
      return (await storage.get('batch')) || null;
    }

    async function saveBatch(b) {
      await storage.set('batch', b);
      const liveId = await storage.get('liveTabId');
      if (liveId != null) {
        try { await tabs.sendMessage(liveId, { type: 'batch:update', batch: b }); } catch (_) { /* aba da live fechada */ }
      }
      return b;
    }

    async function openShopee(openIn) {
      if (openIn === 'window') {
        const w = await windows.create({ url: SHOPEE_URL, focused: true });
        await storage.set('shopeeWindowId', w.id);
        await storage.set('shopeeTabId', w.tabs && w.tabs[0] ? w.tabs[0].id : null);
      } else {
        const t = await tabs.create({ url: SHOPEE_URL, active: true });
        await storage.set('shopeeTabId', t.id);
        await storage.set('shopeeWindowId', null);
      }
    }

    async function closeShopee() {
      const winId = await storage.get('shopeeWindowId');
      const tabId = await storage.get('shopeeTabId');
      try {
        if (winId != null) await windows.remove(winId);
        else if (tabId != null) await tabs.remove(tabId);
      } catch (_) { /* já fechada pelo usuário */ }
      await storage.set('shopeeWindowId', null);
      await storage.set('shopeeTabId', null);
    }

    async function backToLive(b) {
      const liveId = await storage.get('liveTabId');
      const liveWin = await storage.get('liveWindowId');
      if (liveId == null) return;
      try {
        if (b.openIn === 'window' && liveWin != null) await windows.update(liveWin, { focused: true });
        await tabs.update(liveId, { active: true });
        await tabs.sendMessage(liveId, { type: 'batch:resolved', batch: b });
      } catch (_) { /* aba da live fechada */ }
    }

    async function run(msg, sender) {
      const b = await getBatch();
      switch (msg && msg.type) {
        case 'batch:start': {
          if (b && b.phase !== 'done') return { error: 'lote em andamento' };
          const novo = B().createBatch(msg.ids, { openIn: msg.openIn });
          if (sender && sender.tab) {
            await storage.set('liveTabId', sender.tab.id);
            await storage.set('liveWindowId', sender.tab.windowId != null ? sender.tab.windowId : null);
          }
          await openShopee(novo.openIn);
          return saveBatch(novo);
        }
        case 'hand:next': {
          if (!b) return null;
          const item = B().nextPending(b);
          if (!item) return null;
          return { id: item.id, index: b.items.indexOf(item) + 1, total: b.items.length };
        }
        case 'hand:result': {
          if (!b) return null;
          if (msg.status === 'captcha') return saveBatch({ ...b, paused: true });
          const patch = { status: msg.status };
          if (msg.name) patch.name = msg.name;
          let nb = B().setItem(b, msg.id, patch);
          nb = { ...B().advancePhase({ ...nb, paused: false }) };
          await saveBatch(nb);
          if (b.phase === 'resolving' && (nb.phase === 'adding' || nb.phase === 'done')) {
            await closeShopee();
            await backToLive(nb);
          }
          return nb;
        }
        case 'batch:get':
          return b;
        case 'batch:setStatus': {
          if (!b) return null;
          return saveBatch(B().setItem(b, msg.id, { status: msg.status }));
        }
        case 'batch:clear': {
          await storage.set('batch', null);
          const liveId = await storage.get('liveTabId');
          if (liveId != null) {
            try { await tabs.sendMessage(liveId, { type: 'batch:update', batch: null }); } catch (_) { /* ignora */ }
          }
          return null;
        }
        case 'batch:reopen': {
          if (!b) return null;
          if (sender && sender.tab) {
            await storage.set('liveTabId', sender.tab.id);
            await storage.set('liveWindowId', sender.tab.windowId != null ? sender.tab.windowId : null);
          }
          await openShopee(b.openIn);
          return saveBatch({ ...b, paused: false });
        }
        default:
          return undefined;
      }
    }

    function handle(msg, sender) {
      const p = fila.then(() => run(msg, sender));
      fila = p.catch(() => {});
      return p;
    }

    return { handle };
  }

  SLA.createCoordinator = createCoordinator;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createCoordinator };
})(typeof window !== 'undefined' ? window : globalThis);
