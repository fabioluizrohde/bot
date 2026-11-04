// Adição automática do lote à sacola da live (PUT add_items pela ponte), com todas as travas.
// Sem DOM e sem chrome.*: leitura da sacola, envio e "marcar tentativa" entram como dependências (testável).
//
// Travas (decididas com o Fabio em 2026-11-04):
//  - só o que veio do lote (resolvido, com loja e produto conhecidos); nunca monta lista por conta própria;
//  - envio automático UMA vez por lote (marca "já tentei" ANTES de enviar, guardada no lote);
//  - só na mesma live em que o lote nasceu, com o lote em "adding" e sem pausa;
//  - lê a sacola antes: tira o que já está nela e não passa do limite;
//  - erro/tempo esgotado: nunca repete sozinho; relê a sacola e só confirma o que apareceu;
//  - 2 erros seguidos desligam o automático até recarregar a página (o botão manual continua);
//  - pedidos de no máximo 20 produtos, parando no primeiro erro.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const MAX_POR_PEDIDO = 20;
  const MAX_ERROS = 2;
  const ESPERAS_MS = [1000, 1500, 2000, 3000]; // pausas entre as releituras da sacola depois do envio

  // Motivo de não enviar agora, ou null se pode. auto=true: envio automático (respeita "já tentou" e o disjuntor);
  // auto=false: clique do Fabio (só ignora esses dois).
  function gate({ batch, sessionId, auto, erros }) {
    if (!batch) return 'sem_lote';
    if (batch.phase !== 'adding') return 'fase';
    if (batch.paused) return 'pausado';
    if (!sessionId || !batch.sessionId || batch.sessionId !== sessionId) return 'outra_sessao';
    if (auto && batch.addTried) return 'ja_tentou';
    if (auto && (erros || 0) >= MAX_ERROS) return 'desligado';
    return null;
  }

  // candidatos: [{id, shopId, itemId}]; bag: {items:[{itemId}], total, maxItems}.
  // Devolve {already, toAdd} e, quando não há o que enviar, reason: 'nada' | 'sacola_cheia'.
  function planItems(candidatos, bag) {
    const naSacola = new Set((bag.items || []).map((c) => c.itemId));
    const already = candidatos.filter((c) => naSacola.has(c.itemId));
    const toAdd = candidatos.filter((c) => !naSacola.has(c.itemId));
    if (!toAdd.length) return { already, toAdd, reason: 'nada' };
    const total = Math.max(Number(bag.total) || 0, (bag.items || []).length);
    if (Number(bag.maxItems) > 0 && total + toAdd.length > Number(bag.maxItems)) {
      return { already, toAdd: [], reason: 'sacola_cheia' };
    }
    return { already, toAdd };
  }

  function chunks(lista) {
    const out = [];
    for (let i = 0; i < lista.length; i += MAX_POR_PEDIDO) out.push(lista.slice(i, i + MAX_POR_PEDIDO));
    return out;
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // Executa a adição. Nunca lança. Devolve { updates: [{id, status}], aviso } — quem chama grava os status.
  // circuit = { erros } é alterado aqui (erro soma; sucesso completo zera).
  async function run({ batch, sessionId, auto, circuit, deps }) {
    try {
      const motivo = gate({ batch, sessionId, auto, erros: circuit.erros });
      if (motivo === 'desligado') {
        return { updates: [], aviso: 'A adição automática foi desligada depois de erros seguidos. Use o botão "Adicionar à sacola".' };
      }
      if (motivo) return { updates: [], aviso: '' };

      const candidatos = SLA.batch.addableItems(batch);
      if (!candidatos.length) {
        return { updates: [], aviso: 'Não consegui os números dos produtos do lote para adicionar. Confira e adicione pela tela de Produtos.' };
      }

      // Marca a tentativa ANTES de qualquer pedido: se algo travar daqui em diante, não há segundo envio automático.
      if (auto) {
        const m = await deps.markAdd();
        if (!m || !m.ok) return { updates: [], aviso: '' };
      }

      const antes = await deps.readBag(sessionId);
      if (!antes || !antes.ok) {
        circuit.erros++;
        return { updates: [], aviso: 'Não consegui ler a sacola antes de adicionar, então não enviei nada. Use "Adicionar à sacola" para tentar de novo.' };
      }

      const plano = planItems(candidatos, antes);
      const updates = plano.already.map((c) => ({ id: c.id, status: 'ja_na_sacola' }));
      if (plano.reason === 'sacola_cheia') {
        return { updates, aviso: `A sacola não comporta mais ${plural(plano.toAdd.length || candidatos.length - plano.already.length, 'produto', 'produtos')} (limite ${antes.maxItems}). Nada foi enviado.` };
      }
      if (plano.reason === 'nada') {
        return { updates, aviso: `${plural(plano.already.length, 'produto já estava', 'produtos já estavam')} na sacola.` };
      }

      let falhou = false;
      let definitivo = false; // erro que a Shopee respondeu (recusou): esperar a sacola não adianta
      for (const parte of chunks(plano.toAdd)) {
        const r = await deps.addItems(sessionId, parte.map((c) => ({ shopId: c.shopId, itemId: c.itemId })));
        if (!r || !r.ok) { falhou = true; definitivo = !!(r && (r.reason === 'http' || r.reason === 'recusado')); break; } // nunca repete
      }

      // Confere pela sacola: só vira "adicionado" o que apareceu lá (vale também depois de erro/tempo esgotado).
      // A Shopee demora um instante para mostrar o produto: relê algumas vezes antes de desistir.
      const esperas = deps.wait && !definitivo ? ESPERAS_MS : [];
      let depois = await deps.readBag(sessionId);
      const faltam = (b) => !(b && b.ok) || plano.toAdd.some((c) => !(b.items || []).some((x) => x.itemId === c.itemId));
      for (const ms of esperas) {
        if (!faltam(depois)) break;
        await deps.wait(ms);
        depois = await deps.readBag(sessionId);
      }
      let adicionados = 0;
      if (depois && depois.ok) {
        const naSacola = new Set((depois.items || []).map((c) => c.itemId));
        for (const c of plano.toAdd) {
          if (naSacola.has(c.itemId)) { updates.push({ id: c.id, status: 'adicionado' }); adicionados++; }
        }
      }

      const completo = !falhou && !!(depois && depois.ok) && adicionados === plano.toAdd.length;
      if (completo) circuit.erros = 0; else circuit.erros++;

      const ja = plano.already.length ? ` (${plural(plano.already.length, 'já estava', 'já estavam')} na sacola)` : '';
      if (completo) return { updates, aviso: `${plural(adicionados, 'adicionado', 'adicionados')} à sacola${ja}.` };
      if (!(depois && depois.ok)) {
        return { updates, aviso: 'Enviei os produtos, mas não consegui conferir a sacola. Olhe a sacola antes de tentar de novo.' };
      }
      return {
        updates,
        aviso: `${adicionados} de ${plano.toAdd.length} adicionados${ja}. Os outros não apareceram na sacola. Confira e use "Adicionar à sacola" para tentar de novo.`,
      };
    } catch (e) {
      if (circuit) circuit.erros++;
      return { updates: [], aviso: 'Não consegui adicionar à sacola: ' + String((e && e.message) || e) };
    }
  }

  SLA.autoAdd = { MAX_POR_PEDIDO, MAX_ERROS, gate, planItems, chunks, run };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.autoAdd;
})(typeof window !== 'undefined' ? window : globalThis);
