// Service worker: só liga o coordenador ao chrome.* e às mensagens das abas.
importScripts('lib/batch.js', 'background/coordinator.js');

const session = chrome.storage.session;
const coordinator = self.SLA.createCoordinator({
  storage: {
    async get(key) { return (await session.get(key))[key]; },
    async set(key, value) { await session.set({ [key]: value }); },
  },
  tabs: {
    create: (o) => chrome.tabs.create(o),
    update: (id, o) => chrome.tabs.update(id, o),
    remove: (id) => chrome.tabs.remove(id),
    sendMessage: (id, m) => chrome.tabs.sendMessage(id, m),
  },
  windows: {
    create: (o) => chrome.windows.create(o),
    update: (id, o) => chrome.windows.update(id, o),
    remove: (id) => chrome.windows.remove(id),
  },
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  coordinator.handle(msg, sender).then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
  return true; // resposta assíncrona
});
