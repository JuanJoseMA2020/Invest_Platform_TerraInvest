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
  id: "trading", titulo: "Trading", icono: "trading",
  montar(el) {
    const c = App.trading.cfg, v = c.validacion;
    el.innerHTML = App.cabecera("Trading · motor de tendencia", "Lo que el bot está viendo ahora mismo en el mercado.", '<span id="t-chip" class="chip"><i></i>Cargando…</span>') + `
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
          <div class="note info small" style="margin-top:12px">Esta pantalla no ve tu cuenta. Las posiciones reales, el capital y los avisos del bot llegan por <b>Telegram</b> (/estado, /motores).</div>
        </div>
      </div></section>
      <section><h2>Las monedas del mes</h2><div class="card scroll"><table class="table"><thead><tr><th>Moneda</th><th>Precio</th><th>Estado</th><th>Compra sobre</th><th>Vende bajo</th><th>Stop si comprara hoy</th></tr></thead><tbody id="t-body"></tbody></table></div>
      <p class="tiny mute" style="margin-top:8px">El grupo se renueva el día 1 de cada mes con las ${c.top} monedas de mayor volumen de los últimos ${c.ventana} días.</p></section>`;
    this.g = App.grafico(App.$("#t-chart", el));
    App.$("#t-body", el).addEventListener("click", e => { const tr = e.target.closest("tr[data-s]"); if (tr) { App.trading.sel = tr.dataset.s; this.pintar(); } });
    this.pintar();
  },
  mostrar() { App.trading.actualizar(); },
  pintar() {
    const T = App.trading, f = App.fmt, $ = App.$;
    if (!this.montado) return;
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
  reloj() { const p = 4 * 3600000, t = App.api.ahora(); App.texto(App.$("#t-k3"), App.fmt.falta(Math.ceil(t / p) * p - t)); },
});
