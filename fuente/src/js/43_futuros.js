/* Modulo Futuros: (1) el bot automatico de futuros, con su estado real publicado por el servidor; (2) simulador en papel
   para practicar a mano; (3) tasa de financiacion y estudio. La pagina no envia ordenes ni usa claves. */
App.futuros = {
  cfg: DATOS.futuros, COMISION: 0.0005, MANT: 0.005, mercado: {}, marcas: {}, velas: {}, radar: {}, sel: "BTCUSDT", lado: 1, listo: false, tab: App.store.get("futuros_tab", "bot"),
  S: Object.assign({ saldo: 1000, inicial: 1000, abiertas: [], cerradas: [] }, App.store.get("futuros", {})),
  guardar() { App.store.set("futuros", this.S); },

  liquidacion(entrada, lado, apal) { return entrada * (1 - lado * (1 / apal - this.MANT)); },   // aproximada, margen aislado
  pnl(p, precio) { return p.lado * p.cant * (precio - p.entrada); },

  async tick(completo) {
    const syms = this.cfg.simbolos;
    const idx = await App.api.fut("/fapi/v1/premiumIndex", null, 4000);
    idx.forEach(x => { this.marcas[x.symbol] = +x.markPrice; if (syms.includes(x.symbol)) this.mercado[x.symbol] = { precio: +x.markPrice, tasa: +x.lastFundingRate, prox: +x.nextFundingTime }; });
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

  /** Bot del servidor valorado con el precio de marca de este momento (si ya llego); si no, el ultimo publicado. */
  vivoBot(B) {
    const precio = o => this.marcas[o.sym] || o.precio, pnl = o => (o.parcial || 0) + o.lado * o.cant * (precio(o) - o.p_in) - o.comision - o.financiacion;
    const abiertas = B.abiertas.map(o => ({ ...o, vivo: precio(o), res: pnl(o) }));
    return { abiertas, eq: B.patrimonio - B.no_realizado + abiertas.reduce((a, o) => a + o.res, 0) };
  }
};

App.registrar({
  id: "futuros", titulo: "Futuros", icono: "futuros", grupo: "Bots automáticos",
  montar(el) {
    const F = App.futuros, c = F.cfg, e = c.estudio;
    el.innerHTML = App.cabecera("Futuros", "Apostar a que una moneda sube (largo) o baja (corto). Un bot lo hace solo en la cuenta de práctica; tú puedes practicar a mano en el simulador.", '<span id="fx-srv"></span>') + `
      <div class="tabs" id="fx-tabs"><button data-t="bot">${App.ico.bot} Bot automático</button><button data-t="sim">Simulador manual</button><button data-t="fin">Financiación y estudio</button></div>

      <div data-p="bot">
        <div class="row" id="fx-chips" style="margin:-4px 0 14px"></div>
        <div class="grid g4 kpis">
          <div class="card kpi"><span>Patrimonio</span><b id="fb-eq" class="num">—</b><span id="fb-eqs"></span></div>
          <div class="card kpi"><span>Ganado / perdido</span><b id="fb-res" class="num">—</b><span id="fb-ress"></span></div>
          <div class="card kpi"><span>Caída desde el máximo</span><b id="fb-dd" class="num">—</b><span>freno: se detiene al ${App.fmt.pct(0.3, 0, false)}</span></div>
          <div class="card kpi"><span>Operaciones cerradas</span><b id="fb-n" class="num">—</b><span id="fb-ns"></span></div>
        </div>
        <section><div class="grid split">
          <div class="card"><div class="row between"><h3>Patrimonio del bot</h3><span class="tiny faint" id="fb-desde"></span></div><div id="fb-curva" class="chart md" style="margin-top:10px"></div></div>
          <div class="card"><h3>Cómo decide</h3>
            <ul class="clean small" style="margin-top:10px">
              <li><b>Entra</b> una vez al día (7:00 p. m. de Colombia): largos si Bitcoin está más de 5 % sobre su media de 100 días y la moneda rompe su máximo de 20 días; cortos al revés. Si Bitcoin está pegado a su media (mercado indeciso), no abre.</li>
              <li><b>Cobra en escalones, registrados en Binance:</b> cuando gana 1 vez el movimiento diario normal (ATR) cierra <b>un tercio</b> y el stop pasa a la entrada: lo que queda <b>ya no puede perder</b>. A 3 ATR cobra la <b>mitad del resto</b> y el stop asegura ganancia. Lo último sigue corriendo.</li>
              <li><b>Sale</b> del resto si la tendencia se rompe (mínimo o máximo de 10 días) o si Bitcoin cruza su media.</li>
              <li>Arriesga <b>0,75 %</b> del capital por operación, con stop inicial a 3 ATR, registrado en Binance.</li>
              <li>Apalancamiento 2x en margen aislado: la liquidación queda mucho más lejos que el stop.</li>
              <li>Frenos: −3 % en el día o −6 % en la semana no abre más; −30 % desde el máximo cierra todo y se detiene.</li>
            </ul>
            <details class="more"><summary>Qué esperar (estudio 2020–2026)</summary>
              <table class="table"><tr><th></th><th class="num">Cerebro 1</th><th class="num">Cerebro 2 (hoy)</th></tr>
              <tr><td>Operaciones con ganancia</td><td class="num">35–39 %</td><td class="num up">65–68 %</td></tr>
              <tr><td>Peor racha de pérdidas seguidas</td><td class="num">31</td><td class="num up">11</td></tr>
              <tr><td>Peor caída (examen 2025–26)</td><td class="num">−18 %</td><td class="num up">−9 %</td></tr>
              <tr><td>Rendimiento examen 2025–26</td><td class="num">+8,7 %</td><td class="num">+7,2 %</td></tr>
              <tr><td>Rendimiento 2020–2024</td><td class="num">+33 %</td><td class="num">+13 %</td></tr></table>
              <p class="tiny mute" style="margin-top:8px">El cerebro 2 gana muchas más veces y cae la mitad, a cambio de ceder parte de los movimientos gigantes. Medido con todas las monedas que existieron, comisiones incluidas.</p></details>
          </div></div></section>
        <section><h2>Posiciones abiertas</h2><div class="card scroll"><table class="table compacta"><thead><tr><th>Moneda</th><th>Apuesta</th><th class="num">Tamaño</th><th class="num">Entrada</th><th class="num">Precio</th><th class="num">Stop</th><th>Escalón</th><th class="num">Próximo cobro</th><th class="num">Ya cobrado</th><th class="num">Resultado</th></tr></thead><tbody id="fb-open"></tbody></table></div></section>
        <section><h2>Lo que vigila</h2><div class="card"><p class="small mute" id="fb-btc" style="margin-bottom:8px"></p><div class="scroll"><table class="table"><thead><tr><th>Moneda</th><th class="num">Precio</th><th>Estado</th><th class="num">Entra si cruza</th><th class="num">Sale si cruza</th></tr></thead><tbody id="fb-radar"></tbody></table></div></div></section>
        <section><div class="grid split">
          <div class="card scroll"><h3>Historial</h3><table class="table" style="margin-top:8px"><thead><tr><th>Cierre</th><th>Moneda</th><th>Apuesta</th><th class="num">Entrada → salida</th><th>Motivo</th><th class="num">Resultado</th></tr></thead><tbody id="fb-hist"></tbody></table></div>
          <div class="card"><h3>Bitácora</h3><p class="sub">Todo lo que hizo y por qué. Lo mismo llega a su chat de Telegram.</p><div id="fb-feed" style="margin-top:6px;max-height:520px;overflow:auto"></div></div>
        </div></section>
        <section id="fb-conectar"></section>
      </div>

      <div data-p="sim" hidden>
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
        <section><h2>Posiciones abiertas</h2><div class="card scroll"><table class="table"><thead><tr><th>Contrato</th><th>Lado</th><th class="num">Tamaño</th><th class="num">Entrada</th><th class="num">Precio</th><th class="num">Liquidación</th><th class="num">Resultado</th><th></th></tr></thead><tbody id="f-open"></tbody></table></div></section>
        <section><h2>Historial en papel</h2><div class="card scroll"><table class="table"><thead><tr><th>Cierre</th><th>Contrato</th><th>Lado</th><th class="num">Apal.</th><th class="num">Entrada</th><th class="num">Salida</th><th>Motivo</th><th class="num">Neto</th></tr></thead><tbody id="f-hist"></tbody></table></div>
          <div class="row" style="margin-top:10px"><button id="f-reset" class="btn sm ghost">Reiniciar simulador (1.000 USDT)</button></div></section>
      </div>

      <div data-p="fin" hidden><div class="grid g2">
        <div class="card"><h3>Tasa de financiación en vivo</h3><p class="small mute" style="margin:4px 0 8px">Cada 8 horas, quien está comprado le paga a quien está vendido (si es positiva), o al revés.</p>
          <div class="scroll"><table class="table"><thead><tr><th>Contrato</th><th class="num">Cada 8 h</th><th class="num">Al año</th><th class="num">Próximo cobro</th><th>Tendencia</th></tr></thead><tbody id="f-fund"></tbody></table></div>
          <p class="tiny mute" style="margin-top:8px">«Tendencia» usa la regla del bot de trading con velas de 4 horas.</p></div>
        <div class="card"><h3>Qué dice el estudio de futuros</h3><p class="small mute" style="margin:4px 0 8px">Ideas medidas con datos reales antes de construir nada.</p>
          <table class="table"><thead><tr><th>Idea</th><th>Resultado</th><th></th></tr></thead><tbody>
            <tr><td class="wrap">Tendencia en largo y corto (el bot automático)</td><td class="wrap">examen 2025-26: +9 % al año; peor caída 17 %</td><td><span class="tag up">En prueba</span></td></tr>
            <tr><td class="wrap">Señales de 15 minutos en futuros</td><td class="wrap">${App.fmt.pct(e.intradia_gana, 3)} por señal; la comisión es ${App.fmt.pct(e.intradia_comision, 2, false)}</td><td><span class="tag down">Pierde</span></td></tr>
            <tr><td class="wrap">Solo cortos</td><td class="wrap">${App.fmt.pct(e.cortos_anual)} al año</td><td><span class="tag down">Pierde</span></td></tr>
            <tr><td class="wrap">Neutral: cobrar la financiación</td><td class="wrap">BTC ${App.fmt.pct(e.carry_btc)} en ${e.carry_periodo}</td><td><span class="tag warn">Poco</span></td></tr></tbody></table>
          <div class="row" style="margin-top:12px"><label class="field">Capital para la estrategia neutral<input id="f-cap" type="number" min="0" step="50" value="1000"></label><div class="small" id="f-carry"></div></div>
          <p class="tiny mute" style="margin-top:8px">Neutral = comprar la moneda y vender el mismo monto en futuros: no gana ni pierde con el precio; cobra la financiación sobre la mitad del capital.</p></div>
      </div></div>`;
    this.g = App.grafico(App.$("#f-chart", el));
    this.curva = App.lineas(App.$("#fb-curva", el), { horas: true });
    const tabs = App.$("#fx-tabs", el);
    const ponTab = t => { F.tab = t; App.store.set("futuros_tab", t); tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); el.querySelectorAll("[data-p]").forEach(p => { p.hidden = p.dataset.p !== t; }); this.firma = null; this.pintar(); };
    tabs.onclick = ev => { const b = ev.target.closest("button"); if (b) ponTab(b.dataset.t); };
    ponTab(F.tab);
    App.$("#f-seg", el).onclick = ev => { const b = ev.target.closest("button"); if (!b) return; F.sel = b.dataset.s; el.querySelectorAll("#f-seg button").forEach(x => x.classList.toggle("on", x === b)); this.pintar(); };
    App.$("#f-lado", el).onclick = ev => { const b = ev.target.closest("button"); if (!b) return; F.lado = +b.dataset.l; el.querySelectorAll("#f-lado button").forEach(x => x.classList.toggle("on", x === b)); this.pintar(); };
    ["#f-margen", "#f-apal", "#f-cap"].forEach(id => App.$(id, el).addEventListener("input", () => this.pintar()));
    App.$("#f-abrir", el).onclick = () => { const err = F.abrir(F.sel, F.lado, +App.$("#f-margen").value, +App.$("#f-apal").value); App.texto(App.$("#f-err"), err || ""); if (!err) App.toast("Posición abierta en papel"); this.pintar(); };
    el.addEventListener("click", ev => { const b = ev.target.closest("[data-cerrar]"); if (b) { F.cerrar(b.dataset.cerrar); this.pintar(); } const r = ev.target.closest("[data-ir]"); if (r) { F.sel = r.dataset.ir; el.querySelectorAll("#f-seg button").forEach(x => x.classList.toggle("on", x.dataset.s === F.sel)); ponTab("sim"); window.scrollTo({ top: 0, behavior: "smooth" }); } });
    App.$("#f-reset", el).onclick = () => { if (confirm("¿Reiniciar el simulador? Se borran las posiciones y el historial en papel.")) { F.S = { saldo: 1000, inicial: 1000, abiertas: [], cerradas: [] }; F.guardar(); this.pintar(); } };
  },
  mostrar() { App.futuros.tick(true).then(() => this.pintar()).catch(() => {}); },
  pintar() {
    if (!this.montado) return;
    App.html(App.$("#fx-srv"), App.estado.chip());
    const t = App.futuros.tab;
    if (t === "bot") this.pintarBot(); else if (t === "sim") this.pintarSim(); else this.pintarFin();
  },

  pintarBot() {
    const $ = App.$, f = App.fmt, B = App.estado.fut, F = App.futuros;
    if (!B) { App.html($("#fx-chips"), '<div class="note small">El servidor todavía no ha publicado el estado del bot de futuros. Aparece aquí en cuanto corra su primer ciclo.</div>'); return; }
    const { abiertas, eq } = F.vivoBot(B), r = eq / B.capital - 1;
    const prox = B.proxima_decision;
    App.html($("#fx-chips"), [
      B.modo === "demo" ? '<span class="chip ok"><i></i>Cuenta demo de Binance</span>' : '<span class="chip info"><i></i>En papel: precios reales, sin cuenta</span>',
      B.pausa ? '<span class="chip bad"><i></i>Detenido por el freno del 30 %</span>' : B.bloqueo ? `<span class="chip warn"><i></i>${App.esc(B.bloqueo.split(":")[0])}</span>` : '<span class="chip ok"><i></i>Frenos sin activar</span>',
      `<span class="chip ${B.telegram ? "ok" : ""}"><i></i>${B.telegram ? "Avisos en su Telegram" : "Telegram sin conectar"}</span>`,
      `<span class="chip"><i></i>Próxima decisión en ${f.falta(prox - App.api.ahora())}</span>`].join(""));
    App.texto($("#fb-eq"), f.usdt(eq)); App.texto($("#fb-eqs"), `capital asignado ${f.usdt(B.capital)}`);
    App.texto($("#fb-res"), f.usdt(eq - B.capital, true)); $("#fb-res").className = "num " + (r >= 0 ? "up" : "down");
    App.texto($("#fb-ress"), `${f.pct(r, 2)} · cerradas ${f.usdt(B.realizado, true)} · abiertas ${f.usdt(eq - B.capital - B.realizado, true)}`);
    App.texto($("#fb-dd"), f.pct(-Math.max(0, B.caida), 1)); $("#fb-dd").className = "num " + (B.caida > 0.1 ? "down" : "");
    const s = B.stats;
    App.texto($("#fb-n"), String(s.n)); App.texto($("#fb-ns"), s.n ? `${s.ganadas} ganadas · factor ${s.pf ? s.pf.toFixed(2) : "—"} · comisiones ${f.usdt(s.comisiones)}` : "aún ninguna");
    App.texto($("#fb-desde"), "desde " + f.fechaHora(B.inicio));
    const firma = App.estado.d.actualizado;
    if (this.curva && firma !== this.firma) { this.firma = firma; this.curva.poner([{ color: "#8b5cf6", area: true, datos: [...B.curva, [Date.now(), eq]], base: B.capital }]); }
    App.html($("#fb-open"), abiertas.map(o => {
      const dist = o.stop / o.vivo - 1, pct = o.res / ((o.cant_ini || o.cant) * o.p_in);
      return `<tr><td>${App.coin(o.sym.slice(0, -4))}</td><td>${o.lado > 0 ? '<span class="tag up">Largo ↑</span>' : '<span class="tag down">Corto ↓</span>'}</td>
        <td class="num">${f.dinero(o.cant * o.p_in)}</td><td class="num">${f.precio(o.p_in)}</td><td class="num">${f.precio(o.vivo)}</td>
        <td class="num">${f.precio(o.stop)} <span class="faint">${f.pct(dist, 1)}</span></td>
        <td>${["<span class=\"tag wait\">Esperando</span>", "<span class=\"tag up\">1/3 cobrado · sin riesgo</span>", "<span class=\"tag up\">2 cobros · ganancia asegurada</span>"][o.etapa || 0]}</td>
        <td class="num">${(o.etapa || 0) >= 2 ? '<span class="faint">corre libre</span>' : `${f.precio((o.etapa || 0) ? o.tp2 : o.tp1)} <span class="faint">${f.pct(((o.etapa || 0) ? o.tp2 : o.tp1) / o.vivo - 1, 1)}</span>`}</td>
        <td class="num ${(o.parcial || 0) > 0 ? "up" : "faint"}">${o.parcial ? f.dinero(o.parcial, true) : "—"}</td>
        <td class="num ${o.res >= 0 ? "up" : "down"}"><b>${f.dinero(o.res, true)}</b> <span class="faint">${f.pct(pct, 1)}</span></td></tr>`;
    }).join("") || '<tr><td colspan="9" class="empty">Sin posiciones abiertas.</td></tr>');
    const R = B.radar;
    if (R) {
      const btc = R.btc;
      App.html($("#fb-btc"), `Bitcoin está <b class="${btc.alcista ? "up" : "down"}">${f.pct(btc.distancia, 1)}</b> frente a su media de 100 días → <b>${btc.alcista ? "solo largos" : "solo cortos"}</b>. Niveles calculados al cierre del ${f.fechaHora(R.t)}.`);
      App.html($("#fb-radar"), R.monedas.map(m => {
        const vivo = F.marcas[m.sym] || m.precio, abierta = B.abiertas.find(o => o.sym === m.sym);
        const entra = btc.alcista ? m.max_entrada : m.min_entrada, sale = abierta ? (abierta.lado > 0 ? m.min_salida : m.max_salida) : (btc.alcista ? m.min_salida : m.max_salida);
        const tag = abierta ? (abierta.lado > 0 ? '<span class="tag up">Dentro: largo</span>' : '<span class="tag down">Dentro: corto</span>') : m.objetivo ? '<span class="tag info" title="La regla dice entrar, pero no abrió (por ejemplo, no alcanza el monto mínimo de Binance). Ver la bitácora.">Señal sin abrir</span>' : '<span class="tag wait">Espera</span>';
        return `<tr><td>${App.coin(m.sym.slice(0, -4))}</td><td class="num">${f.precio(vivo)}</td><td>${tag}</td>
          <td class="num">${abierta ? '<span class="faint">—</span>' : `${f.precio(entra)} <span class="faint">${f.pct(entra / vivo - 1, 1)}</span>`}</td>
          <td class="num">${f.precio(sale)} <span class="faint">${f.pct(sale / vivo - 1, 1)}</span></td></tr>`;
      }).join(""));
    }
    App.html($("#fb-hist"), B.cerradas.slice(0, 60).map(o => `<tr><td class="num">${f.fechaHora(o.t_out)}</td><td>${App.coin(o.sym.slice(0, -4))}</td><td>${o.lado > 0 ? '<span class="tag up">Largo</span>' : '<span class="tag down">Corto</span>'}</td>
      <td class="num">${f.precio(o.p_in)} → ${f.precio(o.p_out)}</td><td class="wrap small">${App.esc(o.motivo_out || "")}</td><td class="num ${o.pnl >= 0 ? "up" : "down"}">${f.dinero(o.pnl, true)} <span class="faint">${f.pct(o.pct, 1)}</span></td></tr>`).join("")
      || '<tr><td colspan="6" class="empty">Todavía no ha cerrado operaciones.</td></tr>');
    App.html($("#fb-feed"), App.feed(B.eventos));
    App.html($("#fb-conectar"), B.modo === "demo" ? "" : `<div class="card glow"><div class="row top0" style="gap:14px"><div class="ico v">${App.ico.escudo}</div><div class="grow"><h3>Pasar el bot a la cuenta demo de Binance</h3>
      <p class="sub">Hoy opera en papel con precios reales. Para que envíe órdenes de verdad a la cuenta de práctica y te avise en su propio chat:</p>
      <ol class="steps" style="margin-top:12px">
        <li><div>En <b>demo.binance.com</b> → tu perfil → <b>Gestión de API</b> → crea una llave nueva con permiso de <b>Futuros</b>.</div></li>
        <li><div>En Telegram, abre <b>@BotFather</b> → <b>/newbot</b> → crea un bot nuevo (por ejemplo «TerraInvest Futuros») y envíale «hola».</div></li>
        <li><div>En tu carpeta <b>Bot de Trading › 08 TERRAINVEST</b>, doble clic en <b>«Conectar futuros.bat»</b> y pega lo que te pide. Las llaves van directo al servidor.</div></li>
      </ol><p class="tiny faint" style="margin-top:10px">No transfieras dinero entre Spot y Futuros en la cuenta demo: Spot lo usa el bot de trading.</p></div></div></div>`);
  },

  pintarSim() {
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
      return `<tr><td>${App.coin(p.sym.slice(0, -4))} <span class="faint">${p.apal}x</span></td><td class="${p.lado > 0 ? "up" : "down"}"><b>${p.lado > 0 ? "Largo" : "Corto"}</b></td><td class="num">${f.dinero(p.cant * p.entrada)}</td>
        <td class="num">${f.precio(p.entrada)}</td><td class="num">${f.precio(px)}</td><td class="num">${f.precio(p.liq)}</td>
        <td class="num ${r >= 0 ? "up" : "down"}">${f.dinero(r, true)} <span class="faint">${f.pct(r / p.margen, 1)}</span></td><td><button class="btn sm" data-cerrar="${p.id}">Cerrar</button></td></tr>`;
    }).join("") || '<tr><td colspan="8" class="empty">Sin posiciones. Abre una en papel para ver cómo se comporta.</td></tr>');
    App.html($("#f-hist"), S.cerradas.slice(0, 100).map(p => `<tr><td class="num">${f.fecha(p.tSal)} ${f.hora(p.tSal)}</td><td>${p.sym.slice(0, -4)}</td><td class="${p.lado > 0 ? "up" : "down"}">${p.lado > 0 ? "Largo" : "Corto"}</td><td class="num">${p.apal}x</td>
      <td class="num">${f.precio(p.entrada)}</td><td class="num">${f.precio(p.salida)}</td><td>${p.motivo === "liquidada" ? '<span class="tag down">Liquidada</span>' : "Cierre manual"}</td><td class="num ${p.neto >= 0 ? "up" : "down"}">${f.dinero(p.neto, true)}</td></tr>`).join("")
      || '<tr><td colspan="8" class="empty">Aún no has cerrado operaciones en papel.</td></tr>');
    const k = F.velas[F.sel];
    if (k && this.g) {
      this.g.velas(k.slice(-360), F.sel);
      const r = F.radar[F.sel] || {}, mias = S.abiertas.filter(p => p.sym === F.sel);
      this.g.niveles([...mias.map(p => ({ precio: p.entrada, titulo: p.lado > 0 ? "largo" : "corto", color: "#4f8cff" })), ...mias.map(p => ({ precio: p.liq, titulo: "liquidación", color: "#f5b544" })),
                      ...(mias.length ? [] : [{ precio: r.hi, titulo: "máx. 20 d", color: "#22c58b" }, { precio: r.lo, titulo: "mín. 10 d", color: "#f4566b" }])]);
    }
  },

  pintarFin() {
    const F = App.futuros, f = App.fmt, $ = App.$, b = F.mercado.BTCUSDT;
    App.html($("#f-fund"), F.cfg.simbolos.map(s => {
      const x = F.mercado[s], r = F.radar[s]; if (!x) return "";
      const tag = !r ? '<span class="faint">…</span>' : r.estado > 0 ? '<span class="tag up">Largo</span>' : r.estado < 0 ? '<span class="tag down">Corto</span>' : '<span class="tag wait">Fuera</span>';
      return `<tr class="click" data-ir="${s}"><td>${App.coin(s.slice(0, -4))}</td><td class="num ${x.tasa >= 0 ? "" : "down"}">${f.pct(x.tasa, 4)}</td><td class="num">${f.pct(x.tasa * 3 * 365, 1)}</td><td class="num">${f.falta(x.prox - App.api.ahora())}</td><td>${tag}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="empty">Cargando…</td></tr>');
    if (b) { const cap = +$("#f-cap").value || 0, anual = b.tasa * 3 * 365; App.html($("#f-carry"), `Con la tasa de hoy: <b class="num ${anual >= 0 ? "up" : "down"}">${f.dinero(cap / 2 * anual, true)}</b> al año<br><span class="mute tiny">(${f.pct(anual / 2, 1)} sobre el capital; la tasa cambia cada 8 horas)</span>`); }
  },
});
