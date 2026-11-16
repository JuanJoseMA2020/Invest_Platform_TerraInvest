/* Modulo Trading: radar del motor de tendencia del bot. Calcula con datos publicos lo mismo que el bot calcula en el servidor.
   No ve la cuenta ni las posiciones reales (eso vive en Telegram): muestra que monedas estan en tendencia y a que precio entraria o saldria. */
App.trading = {
  cfg: DATOS.tendencia, universo: [], filas: [], btc: null, listo: false, error: null, sel: null, cargando: false,

  excluida(base) { return this.cfg.excluidas.includes(base) || (base.length > 4 && /(UP|DOWN|BULL|BEAR)$/.test(base)); },

  async cargarUniverso() {   // las 10 mas negociadas del mes, igual que bot/exchange.py
    const hoy = new Date(App.api.ahora()), inicio = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1), mes = new Date(inicio).toISOString().slice(0, 7);
    const guardado = App.store.get("universo");
    if (guardado && guardado.mes === mes && guardado.simbolos.length) return guardado.simbolos;
    const dia = await App.api.spot("/api/v3/ticker/24hr", null, 600000);
    const cands = dia.filter(t => t.symbol.endsWith("USDT") && !this.excluida(t.symbol.slice(0, -4)) && +t.quoteVolume > 0)
      .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 80).map(t => t.symbol);
    const series = await App.api.enLotes(cands, 8, s => App.api.velas(s, "1d", 250, 3600000));
    const vol = {};
    cands.forEach((s, i) => { if (series[i]) vol[s] = series[i].map(x => [+x[0], +x[7]]); });
    const pick = App.modelo.elegirUniverso(vol, inicio, this.cfg.top, this.cfg.ventana, this.cfg.min_historia);
    if (pick.length) App.store.set("universo", { mes, simbolos: pick });
    return pick;
  },

  async actualizar() {
    if (this.cargando) return;
    this.cargando = true;
    try {
      if (!this.universo.length) this.universo = await this.cargarUniverso();
      const c = this.cfg, bpd = 6, syms = [...new Set(["BTCUSDT", ...this.universo])];
      const todas = await App.api.enLotes(syms, 6, s => App.api.velas(s, "4h", 1000, 55000));
      const vel = {}; syms.forEach((s, i) => { if (todas[i]) vel[s] = todas[i]; });
      if (!vel.BTCUSDT) throw new Error("sin datos de Bitcoin");
      this.btc = App.modelo.filtroBtc(App.api.cerradas(vel.BTCUSDT), c.gate_dias, bpd);
      this.filas = this.universo.filter(s => vel[s]).map(s => {
        const k = App.api.cerradas(vel[s]), ch = App.modelo.canal(k, c.canal_in, c.canal_out, bpd), atr = App.modelo.atrDiario(k, bpd);
        const precio = +vel[s][vel[s].length - 1][4];
        const enTendencia = !!(ch && ch.largo && this.btc && this.btc.sano);
        return { sym: s, base: s.slice(0, -4), precio, velas: vel[s], hi: ch ? ch.hi : NaN, lo: ch ? ch.lo : NaN, canalLargo: !!(ch && ch.largo), enTendencia,
                 stop: atr ? precio - c.stop_atr * atr : NaN, atr };
      });
      if (!this.sel || !this.filas.some(f => f.sym === this.sel)) this.sel = (this.filas.find(f => f.enTendencia) || this.filas[0] || {}).sym;
      this.listo = true; this.error = null;
    } catch (e) { this.error = e.message; }
    this.cargando = false;
    if (App.activo && (App.activo.id === "trading" || App.activo.id === "inicio")) App.activo.pintar && App.activo.pintar();
  },

  resumen() {
    if (!this.listo) return { texto: this.error ? "Sin conexión" : "Cargando…", detalle: "" };
    const n = this.filas.filter(f => f.enTendencia).length;
    return { texto: this.btc.sano ? `${n} de ${this.filas.length} en tendencia` : "En efectivo", sano: this.btc.sano,
             detalle: `Bitcoin ${App.fmt.pct(this.btc.dist, 0)} frente a su media de ${this.cfg.gate_dias} días` };
  },
};

App.registrar({
  id: "trading", titulo: "Trading", icono: "trading", grupo: "Bots automáticos",
  montar(el) {
    const c = App.trading.cfg, v = c.validacion;
    el.innerHTML = App.cabecera("Bot de trading", "Compra monedas que entran en tendencia y las vende cuando la tendencia se rompe. Opera solo, en la cuenta de práctica de Binance.", '<span id="tb-srv"></span><span id="t-chip" class="chip"><i></i>Cargando…</span>') + `
      <div class="grid g4 kpis">
        <div class="card kpi"><span>Patrimonio del bot</span><b id="tb-eq" class="num">—</b><span id="tb-eqs"></span></div>
        <div class="card kpi"><span>Ganado / perdido</span><b id="tb-res" class="num">—</b><span id="tb-ress"></span></div>
        <div class="card kpi"><span>Operaciones cerradas</span><b id="tb-n" class="num">—</b><span id="tb-ns"></span></div>
        <div class="card kpi"><span>Ahora mismo</span><b id="tb-st">—</b><span id="tb-sts"></span></div>
      </div>
      <section><div class="grid split">
        <div class="card"><div class="row between"><h3>Patrimonio del bot</h3><span class="tiny faint" id="tb-desde"></span></div><div id="tb-curva" class="chart md" style="margin-top:10px"></div></div>
        <div class="card"><h3>Posiciones abiertas</h3><div class="scroll"><table class="table" style="margin-top:6px"><thead><tr><th>Moneda</th><th class="num">Entrada</th><th class="num">Precio</th><th class="num">Stop</th><th class="num">Resultado</th></tr></thead><tbody id="tb-open"></tbody></table></div>
          <h3 style="margin-top:16px">Últimas operaciones</h3><div class="scroll" style="max-height:260px;overflow:auto"><table class="table" style="margin-top:6px"><thead><tr><th>Cierre</th><th>Moneda</th><th class="num">Resultado</th><th>Motivo</th></tr></thead><tbody id="tb-hist"></tbody></table></div></div>
      </div></section>
      <section><h2>Lo que el bot ve en el mercado</h2></section>
      <div class="grid g4 kpis">
        <div class="card kpi"><span>Mercado</span><b id="t-k1">—</b><span id="t-k1s"></span></div>
        <div class="card kpi"><span>Monedas en tendencia</span><b id="t-k2">—</b><span>de las ${c.top} más negociadas del mes</span></div>
        <div class="card kpi"><span>Próxima decisión</span><b id="t-k3">—</b><span>al cerrar la vela de 4 horas</span></div>
        <div class="card kpi"><span>Riesgo por operación</span><b>${App.fmt.pct(c.riesgo, 2, false)}</b><span>del capital si toca el stop</span></div>
      </div>
      <section><div class="grid split">
        <div class="card"><div class="row between"><h3 id="t-ct">—</h3><span class="tiny mute">Velas de 4 horas · líneas: nivel de compra y de venta</span></div><div id="t-chart" class="chart" style="margin-top:10px"></div></div>
        <div class="card"><h3>La regla, en simple</h3>
          <ul class="clean small" style="margin-top:10px">
            <li><b>Compra</b> cuando la moneda cierra sobre su máximo de ${c.canal_in} días y Bitcoin está sobre su media de ${c.gate_dias} días.</li>
            <li><b>Vende</b> cuando cierra bajo su mínimo de ${c.canal_out} días, o si Bitcoin pierde esa media.</li>
            <li><b>Stop</b> inicial a ${c.stop_atr} veces el movimiento diario normal, registrado en Binance.</li>
          </ul>
          <details class="more"><summary>Cómo le fue en las pruebas (${v.periodo})</summary>
            <table class="table"><tr><th></th><th>Bot</th><th>Comprar BTC</th></tr>
            <tr><td>Rendimiento anual</td><td class="num up">${App.fmt.pct(v.anual)}</td><td class="num">${App.fmt.pct(v.btc_anual)}</td></tr>
            <tr><td>Peor caída</td><td class="num">${App.fmt.pct(v.caida, 1, false)}</td><td class="num down">${App.fmt.pct(v.btc_caida, 1, false)}</td></tr>
            <tr><td>Examen final 2025-26</td><td class="num">${App.fmt.pct(v.examen)}</td><td class="num down">${App.fmt.pct(v.btc_examen)}</td></tr></table>
            <p class="tiny mute" style="margin-top:8px">Medido con todas las monedas que existieron en Binance. Para planear, cuenta con ${v.prudente} al año.</p>
          </details>
          <div class="note info small" style="margin-top:12px">Arriba ves la cuenta real del bot (se actualiza cada 15 minutos). Los avisos al instante llegan por <b>Telegram</b> (/estado, /motores).</div>
        </div>
      </div></section>
      <section><h2>Las monedas del mes</h2><div class="card scroll"><table class="table"><thead><tr><th>Moneda</th><th>Precio</th><th>Estado</th><th>Compra sobre</th><th>Vende bajo</th><th>Stop si comprara hoy</th></tr></thead><tbody id="t-body"></tbody></table></div>
      <p class="tiny mute" style="margin-top:8px">El grupo se renueva el día 1 de cada mes con las ${c.top} monedas de mayor volumen de los últimos ${c.ventana} días.</p></section>`;
    this.g = App.grafico(App.$("#t-chart", el));
    this.curva = App.lineas(App.$("#tb-curva", el), {});
    App.$("#t-body", el).addEventListener("click", e => { const tr = e.target.closest("tr[data-s]"); if (tr) { App.trading.sel = tr.dataset.s; this.pintar(); } });
    this.pintar();
  },
  mostrar() { App.trading.actualizar(); },
  pintar() {
    const T = App.trading, f = App.fmt, $ = App.$;
    if (!this.montado) return;
    this.pintarCuenta();
    const chip = $("#t-chip");
    if (!T.listo) { chip.className = "chip" + (T.error ? " bad" : ""); chip.innerHTML = `<i></i>${T.error ? "Sin conexión con Binance" : "Calculando las monedas del mes…"}`; return; }
    chip.className = "chip " + (T.btc.sano ? "ok" : "bad"); chip.innerHTML = `<i></i>${T.btc.sano ? "Bitcoin sano: puede comprar" : "Bitcoin débil: en efectivo"}`;
    App.texto($("#t-k1"), T.btc.sano ? "Favorable" : "En efectivo"); $("#t-k1").className = T.btc.sano ? "up" : "warn";
    App.texto($("#t-k1s"), `Bitcoin ${f.pct(T.btc.dist, 1)} vs su media de ${T.cfg.gate_dias} días`);
    App.texto($("#t-k2"), String(T.filas.filter(x => x.enTendencia).length));
    const dist = (a, b) => f.pct(a / b - 1, 1);
    App.html($("#t-body"), T.filas.map(x => {
      const tag = !T.btc.sano ? '<span class="tag warn">Bitcoin débil</span>' : x.enTendencia ? '<span class="tag up">En tendencia</span>' : '<span class="tag wait">Espera</span>';
      return `<tr class="click ${x.sym === T.sel ? "sel" : ""}" data-s="${x.sym}"><td><b>${x.base}</b></td><td class="num">${f.precio(x.precio)}</td><td>${tag}</td>
        <td class="num">${f.precio(x.hi)} <span class="faint">${dist(x.hi, x.precio)}</span></td>
        <td class="num">${f.precio(x.lo)} <span class="faint">${dist(x.lo, x.precio)}</span></td>
        <td class="num">${f.precio(x.stop)} <span class="faint">${dist(x.stop, x.precio)}</span></td></tr>`;
    }).join("") || '<tr><td colspan="6" class="empty">Sin datos.</td></tr>');
    const s = T.filas.find(x => x.sym === T.sel);
    if (s && this.g) {
      App.texto($("#t-ct"), `${s.base} / USDT`);
      this.g.velas(s.velas.slice(-360), s.sym);
      this.g.niveles([{ precio: s.hi, titulo: "compra", color: "#1fcf8f" }, { precio: s.lo, titulo: "venta", color: "#ff5a6e" }]);
    }
  },
  pintarCuenta() {   // la cuenta real del bot, publicada por el servidor
    const $ = App.$, f = App.fmt, B = App.estado.bot;
    App.html($("#tb-srv"), App.estado.chip());
    if (!B || B.patrimonio == null) return;
    const base = (B.inicial || 100) + (B.aportes || 0), vivo = s => (App.ticker.p[s] || {}).precio || (App.trading.filas.find(x => x.sym === s) || {}).precio;
    const abiertas = B.abiertas.map(o => { const p = vivo(o.sym); return { ...o, vivo: p, res: p ? o.cant * (p - o.p_in) : null }; });
    const eq = B.efectivo != null && abiertas.every(o => o.vivo) ? B.efectivo + abiertas.reduce((a, o) => a + o.cant * o.vivo, 0) : B.patrimonio, r = eq / base - 1;
    App.texto($("#tb-eq"), f.usdt(eq)); App.texto($("#tb-eqs"), `empezó con ${f.usdt(B.inicial)}${B.aportes ? " + aportes " + f.usdt(B.aportes) : ""}`);
    App.texto($("#tb-res"), f.usdt(eq - base, true)); $("#tb-res").className = "num " + (r >= 0 ? "up" : "down"); App.texto($("#tb-ress"), f.pct(r, 2) + " en total");
    const t = B.totales; App.texto($("#tb-n"), String(t.n)); App.texto($("#tb-ns"), `${t.ganadas} ganadas · ${f.usdt(t.pnl, true)}`);
    App.texto($("#tb-st"), B.pausado ? "En pausa" : abiertas.length ? `${abiertas.length} invertida${abiertas.length > 1 ? "s" : ""}` : "En efectivo");
    $("#tb-st").className = B.pausado ? "down" : abiertas.length ? "up" : "warn";
    App.texto($("#tb-sts"), abiertas.length ? `${f.pct(B.exposicion || 0, 0, false)} del capital invertido` : "espera a que Bitcoin recupere su media");
    App.texto($("#tb-desde"), B.curva.length ? "desde " + f.fechaHora(B.curva[0][0]) : "");
    const firma = App.estado.d.actualizado;
    if (this.curva && firma !== this.firma) { this.firma = firma; this.curva.poner([{ color: "#4f8cff", area: true, datos: B.curva, base }]); }
    App.html($("#tb-open"), abiertas.map(o => `<tr><td>${App.coin(o.sym.slice(0, -4))}</td><td class="num">${f.precio(o.p_in)}</td><td class="num">${f.precio(o.vivo)}</td>
      <td class="num">${f.precio(o.stop)} <span class="faint">${o.vivo ? f.pct(o.stop / o.vivo - 1, 1) : ""}</span></td><td class="num ${o.res >= 0 ? "up" : "down"}">${f.dinero(o.res, true)}</td></tr>`).join("")
      || '<tr><td colspan="5" class="empty">Sin posiciones: el bot está en efectivo.</td></tr>');
    App.html($("#tb-hist"), B.cerradas.slice(0, 30).map(o => `<tr><td class="num">${f.fecha(o.t_out)}</td><td>${App.coin(o.sym.slice(0, -4))}</td><td class="num ${o.pnl >= 0 ? "up" : "down"}">${f.dinero(o.pnl, true)}</td><td class="wrap tiny mute">${App.esc(o.motivo)}</td></tr>`).join("")
      || '<tr><td colspan="4" class="empty">Aún no hay operaciones cerradas.</td></tr>');
  },
  reloj() { const p = 4 * 3600000, t = App.api.ahora(); App.texto(App.$("#t-k3"), App.fmt.falta(Math.ceil(t / p) * p - t)); },
});
