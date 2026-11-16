/* Modulo Futuros: simulador en papel de futuros perpetuos de Binance (dinero ficticio, precios reales), monitor de la tasa
   de financiacion y radar de tendencia largo/corto. No envia ordenes ni usa claves. */
App.futuros = {
  cfg: DATOS.futuros, COMISION: 0.0005, MANT: 0.005, mercado: {}, velas: {}, radar: {}, sel: "BTCUSDT", lado: 1, listo: false,
  S: Object.assign({ saldo: 1000, inicial: 1000, abiertas: [], cerradas: [] }, App.store.get("futuros", {})),
  guardar() { App.store.set("futuros", this.S); },

  liquidacion(entrada, lado, apal) { return entrada * (1 - lado * (1 / apal - this.MANT)); },   // aproximada, margen aislado
  pnl(p, precio) { return p.lado * p.cant * (precio - p.entrada); },

  async tick(completo) {
    const syms = this.cfg.simbolos;
    const idx = await App.api.fut("/fapi/v1/premiumIndex", null, 4000);
    idx.forEach(x => { if (syms.includes(x.symbol)) this.mercado[x.symbol] = { precio: +x.markPrice, tasa: +x.lastFundingRate, prox: +x.nextFundingTime }; });
    this.listo = true;
    const ahora = App.api.ahora();
    for (const p of this.S.abiertas.slice()) {   // financiacion y liquidacion de las posiciones en papel
      const m = this.mercado[p.sym]; if (!m) continue;
      const dt = Math.min(ahora - (p.tFin || p.t), 3600000);
      p.fin = (p.fin || 0) + p.lado * p.cant * m.precio * m.tasa * dt / (8 * 3600000); p.tFin = ahora;   // el largo paga si la tasa es positiva
      if (p.lado * (m.precio - p.liq) <= 0) this.cerrar(p.id, p.liq, "liquidada");
    }
    if (this.S.abiertas.length) this.guardar();
    if (completo) await this.cargarRadar();
  },

  async cargarRadar() {
    const syms = this.cfg.simbolos, c = DATOS.tendencia, bpd = 6;
    const todas = await App.api.enLotes(syms, 4, s => App.api.velasFut(s, "4h", 1000, 55000));
    syms.forEach((s, i) => { if (todas[i]) this.velas[s] = todas[i]; });
    if (!this.velas.BTCUSDT) return;
    const btc = App.modelo.filtroBtc(App.api.cerradas(this.velas.BTCUSDT), c.gate_dias, bpd);
    syms.forEach(s => {
      if (!this.velas[s]) return;
      const k = App.api.cerradas(this.velas[s]), L = App.modelo.canal(k, c.canal_in, c.canal_out, bpd), C = App.modelo.canalCorto(k, c.canal_in, c.canal_out, bpd);
      this.radar[s] = { estado: L && L.largo && btc.sano ? 1 : (C && C.corto && !btc.sano ? -1 : 0), hi: L ? L.hi : NaN, lo: L ? L.lo : NaN, btc };
    });
  },

  abrir(sym, lado, margen, apal) {
    const m = this.mercado[sym];
    if (!m) return "Sin precio todavía.";
    if (!(margen > 0) || margen > this.S.saldo) return "El margen debe ser mayor que cero y no superar el saldo libre.";
    const nominal = margen * apal, minimo = this.cfg.minimos[sym] || 5;
    if (nominal < minimo) return `Binance exige operaciones de al menos ${minimo} USDT en ${sym.slice(0, -4)}. Con ese margen y apalancamiento llegas a ${nominal.toFixed(2)}.`;
    const com = nominal * this.COMISION, entrada = m.precio;
    this.S.saldo -= margen + com;
    this.S.abiertas.push({ id: "f" + Date.now(), sym, lado, apal, margen, entrada, cant: nominal / entrada, t: App.api.ahora(), liq: this.liquidacion(entrada, lado, apal), com, fin: 0 });
    this.guardar(); return null;
  },

  cerrar(id, precio, motivo) {
    const i = this.S.abiertas.findIndex(p => p.id === id); if (i < 0) return;
    const p = this.S.abiertas[i], px = precio || (this.mercado[p.sym] || {}).precio; if (!px) return;
    const com2 = p.cant * px * this.COMISION;
    let neto = this.pnl(p, px) - p.com - com2 - (p.fin || 0);
    if (motivo === "liquidada" || neto < -p.margen) neto = -p.margen;   // en margen aislado no se pierde mas que el margen
    this.S.saldo += p.margen + neto + p.com;   // la comision de apertura ya se habia descontado
    this.S.abiertas.splice(i, 1);
    this.S.cerradas.unshift({ ...p, salida: px, tSal: App.api.ahora(), neto, motivo: motivo || "manual" });
    this.S.cerradas = this.S.cerradas.slice(0, 500);
    this.guardar();
  },

  patrimonio() { return this.S.saldo + this.S.abiertas.reduce((a, p) => { const m = this.mercado[p.sym]; return a + p.margen + (m ? this.pnl(p, m.precio) - (p.fin || 0) : 0); }, 0); },
  resumen() {
    const eq = this.patrimonio(), n = this.S.cerradas.length;
    return { texto: this.S.abiertas.length ? `${this.S.abiertas.length} posición${this.S.abiertas.length > 1 ? "es" : ""} en papel` : (n ? `${App.fmt.dinero(eq - this.S.inicial, true)} en papel` : "Simulador listo"),
             detalle: this.listo && this.mercado.BTCUSDT ? `Financiación BTC ${App.fmt.pct(this.mercado.BTCUSDT.tasa * 3 * 365, 1)} anual` : "Dinero ficticio, precios reales" };
  },
};

App.registrar({
  id: "futuros", titulo: "Futuros", icono: "futuros",
  montar(el) {
    const F = App.futuros, c = F.cfg, e = c.estudio;
    el.innerHTML = App.cabecera("Futuros · simulador", "Futuros perpetuos de Binance con dinero ficticio y precios reales. Para aprender y probar sin arriesgar.", '<span class="chip info"><i></i>Solo simulación</span>') + `
      <div class="grid g4 kpis">
        <div class="card kpi"><span>Patrimonio en papel</span><b id="f-eq">—</b><span id="f-eqs"></span></div>
        <div class="card kpi"><span>Saldo libre</span><b id="f-saldo">—</b><span>disponible para margen</span></div>
        <div class="card kpi"><span>Operaciones cerradas</span><b id="f-n">0</b><span id="f-ns"></span></div>
        <div class="card kpi"><span>Financiación de BTC</span><b id="f-fr">—</b><span id="f-frs"></span></div>
      </div>
      <section><div class="grid split">
        <div class="card"><div class="row between"><div class="seg" id="f-seg">${c.simbolos.map(s => `<button data-s="${s}" class="${s === F.sel ? "on" : ""}">${s.slice(0, -4)}</button>`).join("")}</div><b id="f-px" class="num"></b></div>
          <div id="f-chart" class="chart" style="margin-top:10px"></div></div>
        <div class="card"><h3>Nueva operación en papel</h3>
          <div class="seg" id="f-lado" style="margin-top:12px;width:100%;display:flex"><button data-l="1" class="on" style="flex:1">Largo · gana si sube</button><button data-l="-1" style="flex:1">Corto · gana si baja</button></div>
          <div class="row" style="margin-top:12px"><label class="field">Margen (USDT)<input id="f-margen" type="number" min="1" step="1" value="50"></label>
            <label class="field grow">Apalancamiento <span><b id="f-apv" class="num">2</b>x</span><input id="f-apal" type="range" min="1" max="20" step="1" value="2" style="width:100%;padding:0"></label></div>
          <table class="table" style="margin-top:8px"><tr><td class="mute">Tamaño de la posición</td><td id="f-tam" class="num"></td></tr>
            <tr><td class="mute">Precio de liquidación</td><td id="f-liq" class="num"></td></tr>
            <tr><td class="mute">Comisión de entrada</td><td id="f-com" class="num"></td></tr></table>
          <p id="f-aviso" class="note small" style="margin-top:10px"></p>
          <button id="f-abrir" class="btn pri" style="width:100%;margin-top:12px">Abrir en papel</button><p id="f-err" class="tiny down" style="margin-top:6px"></p></div>
      </div></section>
      <section><h2>Posiciones abiertas</h2><div class="card scroll"><table class="table"><thead><tr><th>Contrato</th><th>Lado</th><th>Tamaño</th><th>Entrada</th><th>Precio</th><th>Liquidación</th><th>Resultado</th><th></th></tr></thead><tbody id="f-open"></tbody></table></div></section>
      <section><div class="grid g2">
        <div class="card"><h3>Tasa de financiación en vivo</h3><p class="small mute" style="margin:4px 0 8px">Cada 8 horas, quien está comprado le paga a quien está vendido (si es positiva), o al revés.</p>
          <div class="scroll"><table class="table"><thead><tr><th>Contrato</th><th>Cada 8 h</th><th>Al año</th><th>Próximo cobro</th><th>Tendencia</th></tr></thead><tbody id="f-fund"></tbody></table></div>
          <p class="tiny mute" style="margin-top:8px">«Tendencia» usa la regla del bot; los cortos son experimentales (ver el estudio).</p></div>
        <div class="card"><h3>Qué dice el estudio de futuros</h3><p class="small mute" style="margin:4px 0 8px">Tres ideas medidas con datos reales antes de construir nada con dinero.</p>
          <table class="table"><thead><tr><th>Idea</th><th>Resultado</th><th></th></tr></thead><tbody>
            <tr><td style="white-space:normal">Señales de 15 minutos en futuros</td><td style="white-space:normal">${App.fmt.pct(e.intradia_gana, 3)} por señal; la comisión es ${App.fmt.pct(e.intradia_comision, 2, false)}</td><td><span class="tag down">Pierde</span></td></tr>
            <tr><td style="white-space:normal">Tendencia con ventas en corto</td><td style="white-space:normal">solo cortos ${App.fmt.pct(e.cortos_anual)} al año; largos solos ${App.fmt.pct(e.largos_anual)}</td><td><span class="tag wait">No aporta</span></td></tr>
            <tr><td style="white-space:normal">Neutral: cobrar la financiación</td><td style="white-space:normal">BTC ${App.fmt.pct(e.carry_btc)} en ${e.carry_periodo}</td><td><span class="tag warn">Poco</span></td></tr></tbody></table>
          <div class="row" style="margin-top:12px"><label class="field">Capital para la estrategia neutral<input id="f-cap" type="number" min="0" step="50" value="1000"></label><div class="small" id="f-carry"></div></div>
          <p class="tiny mute" style="margin-top:8px">Neutral = comprar la moneda y vender el mismo monto en futuros: no gana ni pierde con el precio; cobra la financiación sobre la mitad del capital.</p></div>
      </div></section>
      <section><h2>Historial en papel</h2><div class="card scroll"><table class="table"><thead><tr><th>Cierre</th><th>Contrato</th><th>Lado</th><th>Apal.</th><th>Entrada</th><th>Salida</th><th>Motivo</th><th>Neto</th></tr></thead><tbody id="f-hist"></tbody></table></div>
        <div class="row" style="margin-top:10px"><button id="f-reset" class="btn sm ghost">Reiniciar simulador (1.000 USDT)</button></div></section>`;
    this.g = App.grafico(App.$("#f-chart", el));
    App.$("#f-seg", el).onclick = ev => { const b = ev.target.closest("button"); if (!b) return; F.sel = b.dataset.s; el.querySelectorAll("#f-seg button").forEach(x => x.classList.toggle("on", x === b)); this.pintar(); };
    App.$("#f-lado", el).onclick = ev => { const b = ev.target.closest("button"); if (!b) return; F.lado = +b.dataset.l; el.querySelectorAll("#f-lado button").forEach(x => x.classList.toggle("on", x === b)); this.pintar(); };
    ["#f-margen", "#f-apal", "#f-cap"].forEach(id => App.$(id, el).addEventListener("input", () => this.pintar()));
    App.$("#f-abrir", el).onclick = () => { const err = F.abrir(F.sel, F.lado, +App.$("#f-margen").value, +App.$("#f-apal").value); App.texto(App.$("#f-err"), err || ""); if (!err) App.toast("Posición abierta en papel"); this.pintar(); };
    el.addEventListener("click", ev => { const b = ev.target.closest("[data-cerrar]"); if (b) { F.cerrar(b.dataset.cerrar); this.pintar(); } const r = ev.target.closest("[data-ir]"); if (r) { F.sel = r.dataset.ir; el.querySelectorAll("#f-seg button").forEach(x => x.classList.toggle("on", x.dataset.s === F.sel)); this.pintar(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
    App.$("#f-reset", el).onclick = () => { if (confirm("¿Reiniciar el simulador? Se borran las posiciones y el historial en papel.")) { F.S = { saldo: 1000, inicial: 1000, abiertas: [], cerradas: [] }; F.guardar(); this.pintar(); } };
    this.pintar();
  },
  mostrar() { App.futuros.tick(true).then(() => this.pintar()).catch(() => {}); },
  pintar() {
    if (!this.montado) return;
    const F = App.futuros, f = App.fmt, $ = App.$, S = F.S, m = F.mercado[F.sel], eq = F.patrimonio();
    App.texto($("#f-eq"), f.dinero(eq)); App.texto($("#f-eqs"), `${f.pct(eq / S.inicial - 1, 2)} desde ${f.dinero(S.inicial)}`); $("#f-eq").className = eq > S.inicial ? "up" : eq < S.inicial ? "down" : "";
    App.texto($("#f-saldo"), f.dinero(S.saldo));
    const gan = S.cerradas.filter(x => x.neto > 0).length;
    App.texto($("#f-n"), String(S.cerradas.length)); App.texto($("#f-ns"), S.cerradas.length ? `${gan} ganadas · ${S.cerradas.filter(x => x.motivo === "liquidada").length} liquidadas` : "aún ninguna");
    const b = F.mercado.BTCUSDT;
    if (b) { App.texto($("#f-fr"), f.pct(b.tasa * 3 * 365, 1)); App.texto($("#f-frs"), `al año · ${b.tasa >= 0 ? "pagan los comprados" : "pagan los vendidos"}`); }
    const margen = +$("#f-margen").value || 0, apal = +$("#f-apal").value || 1;
    App.texto($("#f-apv"), String(apal));
    if (m) {
      App.texto($("#f-px"), f.precio(m.precio));
      const liq = F.liquidacion(m.precio, F.lado, apal), dist = Math.abs(liq / m.precio - 1);
      App.texto($("#f-tam"), `${f.dinero(margen * apal)} USDT`); App.texto($("#f-com"), f.dinero(margen * apal * F.COMISION));
      App.texto($("#f-liq"), apal <= 1 && F.lado > 0 ? "no aplica (sin apalancar)" : `${f.precio(liq)}  (${f.pct(F.lado > 0 ? -dist : dist, 1)})`);
      const av = $("#f-aviso");
      av.className = "note small " + (apal >= 10 ? "bad" : apal >= 4 ? "" : "info");
      App.html(av, apal <= 1 ? "Sin apalancamiento: como comprar la moneda, pero también puedes vender en corto."
        : `Con ${apal}x, un movimiento de <b>${f.pct(dist, 1, false)}</b> en contra te liquida: pierdes todo el margen (${f.dinero(margen)}).` + (apal >= 10 ? " Bitcoin se mueve eso en un día normal." : ""));
    }
    App.html($("#f-open"), S.abiertas.map(p => {
      const mm = F.mercado[p.sym], px = mm ? mm.precio : p.entrada, r = F.pnl(p, px) - p.com - (p.fin || 0);
      return `<tr><td><b>${p.sym.slice(0, -4)}</b> <span class="faint">${p.apal}x</span></td><td class="${p.lado > 0 ? "up" : "down"}"><b>${p.lado > 0 ? "Largo" : "Corto"}</b></td><td class="num">${f.dinero(p.cant * p.entrada)}</td>
        <td class="num">${f.precio(p.entrada)}</td><td class="num">${f.precio(px)}</td><td class="num">${f.precio(p.liq)}</td>
        <td class="num ${r >= 0 ? "up" : "down"}">${f.dinero(r, true)} <span class="faint">${f.pct(r / p.margen, 1)}</span></td><td><button class="btn sm" data-cerrar="${p.id}">Cerrar</button></td></tr>`;
    }).join("") || '<tr><td colspan="8" class="empty">Sin posiciones. Abre una en papel para ver cómo se comporta.</td></tr>');
    App.html($("#f-fund"), F.cfg.simbolos.map(s => {
      const x = F.mercado[s], r = F.radar[s]; if (!x) return "";
      const tag = !r ? '<span class="faint">…</span>' : r.estado > 0 ? '<span class="tag up">Largo</span>' : r.estado < 0 ? '<span class="tag down">Corto</span>' : '<span class="tag wait">Fuera</span>';
      return `<tr class="click" data-ir="${s}"><td><b>${s.slice(0, -4)}</b></td><td class="num ${x.tasa >= 0 ? "" : "down"}">${f.pct(x.tasa, 4)}</td><td class="num">${f.pct(x.tasa * 3 * 365, 1)}</td><td class="num">${f.falta(x.prox - App.api.ahora())}</td><td>${tag}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="empty">Cargando…</td></tr>');
    if (b) { const cap = +$("#f-cap").value || 0, anual = b.tasa * 3 * 365; App.html($("#f-carry"), `Con la tasa de hoy: <b class="num ${anual >= 0 ? "up" : "down"}">${f.dinero(cap / 2 * anual, true)}</b> al año<br><span class="mute tiny">(${f.pct(anual / 2, 1)} sobre el capital; la tasa cambia cada 8 horas)</span>`); }
    App.html($("#f-hist"), S.cerradas.slice(0, 100).map(p => `<tr><td class="num">${f.fecha(p.tSal)} ${f.hora(p.tSal)}</td><td>${p.sym.slice(0, -4)}</td><td class="${p.lado > 0 ? "up" : "down"}">${p.lado > 0 ? "Largo" : "Corto"}</td><td class="num">${p.apal}x</td>
      <td class="num">${f.precio(p.entrada)}</td><td class="num">${f.precio(p.salida)}</td><td>${p.motivo === "liquidada" ? '<span class="tag down">Liquidada</span>' : "Cierre manual"}</td><td class="num ${p.neto >= 0 ? "up" : "down"}">${f.dinero(p.neto, true)}</td></tr>`).join("")
      || '<tr><td colspan="8" class="empty">Aún no has cerrado operaciones en papel.</td></tr>');
    const k = F.velas[F.sel];
    if (k && this.g) {
      this.g.velas(k.slice(-360), F.sel);
      const r = F.radar[F.sel] || {}, mias = S.abiertas.filter(p => p.sym === F.sel);
      this.g.niveles([...mias.map(p => ({ precio: p.entrada, titulo: p.lado > 0 ? "largo" : "corto", color: "#5b8cff" })), ...mias.map(p => ({ precio: p.liq, titulo: "liquidación", color: "#f6b93b" })),
                      ...(mias.length ? [] : [{ precio: r.hi, titulo: "máx. 20 d", color: "#1fcf8f" }, { precio: r.lo, titulo: "mín. 10 d", color: "#ff5a6e" }])]);
    }
  },
});
