/* Modulo Inicio: como va todo, en una pantalla. */
App.registrar({
  id: "inicio", titulo: "Inicio", icono: "inicio", grupo: "General",
  montar(el) {
    const mods = [["trading", "Bot de trading", "Compra lo que entra en tendencia y vende cuando se rompe. Cuenta de práctica de Binance.", "", "#4f8cff"],
                  ["futuros", "Bot de futuros", "Apuesta a que sube o a que baja según el mercado. Automático, en cuenta de práctica.", "v", "#8b5cf6"],
                  ["rendimientos", "Rendimientos", "Dónde poner a ganar intereses el dinero quieto, con tasas en vivo y su riesgo.", "t", "#2dd4bf"],
                  ["senales", "Señales", "Avisos de sube/baja a 15 minutos para operar a mano en demo y medir si aciertan.", "a", "#f5b544"]];
    el.innerHTML = App.cabecera("Tu plataforma", "Tus inversiones alternativas en un solo lugar: lo que hace cada bot, cómo va y qué opciones tienes.", '<span id="i-srv"></span><span id="i-conn" class="chip"><i></i>Conectando…</span>') + `
      <div class="grid split">
        <div class="card hero"><div class="row between top0"><div><div class="eyebrow">Cómo van tus bots</div><h3 style="margin-top:4px;font-size:18px">Resultado desde que empezaron, comparado con Bitcoin</h3></div>
          <div class="legend"><span><i style="background:#4f8cff"></i>Bot de trading</span><span><i style="background:#8b5cf6"></i>Bot de futuros</span><span><i style="background:#f7931a"></i>Bitcoin</span></div></div>
          <div id="i-cmp" class="chart md" style="margin-top:12px"></div>
          <p class="tiny faint" style="margin-top:6px">Porcentaje ganado o perdido desde el arranque de cada uno. Bitcoin se mide desde el arranque del bot de trading.</p></div>
        <div class="stack">
          <div class="card kpi"><span><i class="dot"></i>Bot de trading</span><b id="i-k1">—</b><span id="i-k1s"></span></div>
          <div class="card kpi"><span><i class="dot" style="background:#8b5cf6"></i>Bot de futuros</span><b id="i-k2">—</b><span id="i-k2s"></span></div>
          <div class="card kpi"><span><i class="dot" style="background:#f7931a"></i>Bitcoin ahora</span><b id="i-btc" class="num">—</b><span id="i-reg"></span></div>
        </div>
      </div>
      <section><h2>Módulos</h2><div class="grid g4">
        ${mods.map(([id, t, d, c, color]) => `<div class="card mod" data-ir="${id}"><div class="row between"><div class="ico ${c}">${App.ico[id]}</div><span id="i-${id}-tag" class="chip"><i></i>…</span></div>
            <h3>${t}</h3><p class="small mute">${d}</p><div id="i-${id}-sp" class="spark" data-color="${color}"></div>
            <div style="margin-top:auto"><b id="i-${id}-a" style="font-size:17px;letter-spacing:-.01em"></b><div id="i-${id}-b" class="tiny mute"></div></div></div>`).join("")}
      </div></section>
      <section><h2>Camino a dinero real</h2><div id="i-inf"></div></section>
      <section><div class="grid split">
        <div class="card"><h3>Últimas novedades</h3><p class="sub">Lo que hicieron los bots (se actualiza cada 15 minutos).</p><div id="i-feed" style="margin-top:6px"></div></div>
        <div class="card"><h3>Qué esperar de cada uno</h3><p class="sub">Medido con datos de 2020 a 2026; el pasado no garantiza el futuro.</p>
          <table class="table" style="margin-top:8px"><tbody>
            <tr><td>Bot de trading</td><td class="wrap small">Gana <b>6 de cada 10</b> operaciones; <b>+4 % a +9 %</b> al año, caídas de hasta ~12 %.</td></tr>
            <tr><td>Bot de futuros</td><td class="wrap small">Gana <b>2 de cada 3</b> operaciones; <b>+7 %</b> al año en 2025-26, caídas de hasta ~9 %. Gana también cuando el mercado baja.</td></tr>
            <tr><td>Rendimientos</td><td class="wrap small"><b>3 % a 5 %</b> al año en dólares digitales; riesgo bajo pero no cero.</td></tr>
            <tr><td>Señales</td><td class="wrap small">En prueba: necesitan acertar más del <b>55,6 %</b> para ganar.</td></tr></tbody></table>
          <div class="note info small" style="margin-top:12px">Todo corre en <b>cuentas de práctica</b>. Pasar a dinero real es una decisión tuya, después de ver resultados aquí.</div></div>
      </div></section>
      <p class="disclaimer">TerraInvest es una herramienta personal de estudio y práctica. No es asesoría financiera. Las criptomonedas pueden perder gran parte de su valor; los rendimientos pasados no garantizan los futuros.</p>`;
    el.addEventListener("click", e => { const c = e.target.closest("[data-ir]"); if (c) App.ir(c.dataset.ir); });
    this.cmp = App.lineas(App.$("#i-cmp", el), { formato: x => (x >= 0 ? "+" : "") + x.toFixed(1) + " %" });
    this.pintar();
  },
  mostrar() { this.cargarBtc(); },
  async cargarBtc() {
    const b = App.estado.bot, desde = b && b.curva && b.curva.length ? b.curva[0][0] : Date.now() - 30 * 864e5;
    try { this.btcK = await App.api.velas("BTCUSDT", "4h", Math.min(1000, Math.ceil((Date.now() - desde) / 144e5) + 2), 600000); this.firma = null; this.pintar(); } catch (e) { /* sin conexion */ }
  },
  pintar() {
    if (!this.montado) return;
    const $ = App.$, f = App.fmt, T = App.trading, E = App.estado, bot = E.bot, fut = E.fut, conn = $("#i-conn");
    conn.className = "chip " + (App.api.ok ? "ok" : "bad"); App.html(conn, `<i></i>${App.api.ok ? "Binance en vivo" : "Sin conexión con Binance"}`);
    App.html($("#i-srv"), E.chip());
    const precio = (App.ticker.p.BTCUSDT || {}).precio;
    if (precio) App.texto($("#i-btc"), "$" + f.precio(precio));
    if (T.listo) App.texto($("#i-reg"), T.btc.sano ? `Sobre su media de ${T.cfg.gate_dias} días (${f.pct(T.btc.dist, 1)})` : `Bajo su media de ${T.cfg.gate_dias} días (${f.pct(T.btc.dist, 1)})`);
    // KPIs de los bots
    if (bot && bot.patrimonio != null) {
      const base = (bot.inicial || 100) + (bot.aportes || 0), r = bot.patrimonio / base - 1;
      App.texto($("#i-k1"), f.usdt(bot.patrimonio)); $("#i-k1").className = "num " + (r >= 0 ? "up" : "down");
      App.texto($("#i-k1s"), `${f.pct(r, 2)} desde ${f.usdt(base)} · ${bot.abiertas.length} posiciones`);
    }
    if (fut) {
      const r = fut.patrimonio / fut.capital - 1;
      App.texto($("#i-k2"), f.usdt(fut.patrimonio)); $("#i-k2").className = "num " + (r >= 0 ? "up" : "down");
      App.texto($("#i-k2s"), `${f.pct(r, 2)} desde ${f.usdt(fut.capital)} · ${fut.abiertas.length} posiciones · ${fut.modo === "demo" ? "cuenta demo" : "en papel"}`);
    }
    // comparativa (solo se redibuja si cambian los datos)
    const firma = [E.d && E.d.actualizado, this.btcK && this.btcK.length].join("|");
    if (this.cmp && firma !== this.firma) {
      this.firma = firma;
      const series = [];
      if (bot && bot.curva && bot.curva.length) { const b0 = bot.curva[0][1]; series.push({ color: "#4f8cff", area: true, datos: bot.curva.map(([t, v]) => [t, 100 * (v / b0 - 1)]), base: 0 }); }
      if (fut && fut.curva && fut.curva.length) series.push({ color: "#8b5cf6", datos: fut.curva.map(([t, v]) => [t, 100 * (v / fut.capital - 1)]) });
      if (this.btcK && bot && bot.curva && bot.curva.length) {
        const t0 = bot.curva[0][0], k = this.btcK.filter(x => +x[0] >= t0 - 144e5);
        if (k.length) { const p0 = +k[0][4]; series.push({ color: "#f7931a", punteada: true, datos: k.map(x => [+x[0], 100 * (+x[4] / p0 - 1)]) }); }
      }
      this.cmp.poner(series);
    }
    // tarjetas de modulos
    const pon = (id, r, cls) => { App.texto($(`#i-${id}-a`), r.texto); App.texto($(`#i-${id}-b`), r.detalle); const t = $(`#i-${id}-tag`); t.className = "chip " + cls[0]; App.html(t, `<i></i>${cls[1]}`); };
    pon("trading", bot ? { texto: f.usdt(bot.patrimonio), detalle: `${bot.totales.n} operaciones cerradas · ${bot.abiertas.length ? bot.abiertas.length + " abiertas" : "en efectivo"}` } : T.resumen(),
        bot && bot.abiertas.length ? ["ok", "Invertido"] : T.listo && !T.btc.sano ? ["warn", "En efectivo"] : ["info", "Vigilando"]);
    pon("futuros", fut ? { texto: f.usdt(fut.patrimonio), detalle: `${fut.abiertas.filter(o => o.lado > 0).length} largos · ${fut.abiertas.filter(o => o.lado < 0).length} cortos · ${fut.stats.n} cerradas` } : App.futuros.resumen(),
        fut ? (fut.pausa ? ["bad", "Detenido"] : ["ok", fut.modo === "demo" ? "Demo" : "Papel"]) : ["", "Sin datos"]);
    const R = App.rendimientos.resumen(); pon("rendimientos", R, ["info", "Tasas en vivo"]);
    const rs = App.senales.resumen(); pon("senales", rs, rs.activa ? ["bad", "Señal activa"] : ["info", "Vigilando"]);
    if (bot && bot.curva) App.spark($("#i-trading-sp"), App.sparkDatos(bot.curva.slice(-120)), "#4f8cff");
    if (fut && fut.curva) App.spark($("#i-futuros-sp"), App.sparkDatos(fut.curva.slice(-200)), "#8b5cf6");
    const op = App.rendimientos.mejor(); if (op && op.serie && op.serie.length > 1) App.spark($("#i-rendimientos-sp"), op.serie.map(([m, v], i) => ({ time: Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1) / 1000, value: 100 * v })), "#2dd4bf");
    // camino a dinero real (del informe mensual)
    const inf = E.d && E.d.informe;
    App.html($("#i-inf"), !inf || !inf.bots ? '<div class="card"><p class="small mute">El primer informe mensual llega el 1 del próximo mes por Telegram (chat de futuros) y aparece aquí: compara cada bot con lo esperado y dice si ya se puede considerar dinero real.</p></div>'
      : `<p class="small mute" style="margin:-4px 0 10px">Informe ${inf.parcial ? "parcial" : "mensual"} de ${App.esc(inf.nombre)}. Se necesitan al menos 3 meses de prueba; la decisión siempre es tuya y empieza con poco.</p>
        <div class="grid g2">${Object.entries(inf.bots).map(([k, b]) => `<div class="card"><div class="row between"><h3>${k === "trading" ? "Bot de trading" : "Bot de futuros"}</h3>
          <span class="chip ${b.listo ? "ok" : "warn"}"><i></i>${b.listo ? "Listo para considerar" : "Seguir en demo"}</span></div>
          <div class="row" style="gap:18px;margin:10px 0"><div><div class="tiny mute">Mes</div><b class="num ${b.mes && b.mes.ret >= 0 ? "up" : "down"}">${b.mes ? f.pct(b.mes.ret, 2) : "—"}</b></div>
            <div><div class="tiny mute">Desde que empezó</div><b class="num ${b.total && b.total.ret >= 0 ? "up" : "down"}">${b.total ? f.pct(b.total.ret, 2) : "—"}</b></div>
            <div><div class="tiny mute">Peor caída</div><b class="num">${b.total ? f.pct(-b.total.caida, 1) : "—"}</b></div></div>
          <ul class="clean small">${b.lista.map(([ok, t]) => `<li style="list-style:none;margin-left:-18px">${ok === true ? "✅" : ok === false ? "❌" : "⏳"} ${App.esc(t)}</li>`).join("")}</ul>
          <div class="note ${b.listo ? "good" : "info"} small" style="margin-top:10px">${App.esc(b.veredicto)}</div></div>`).join("")}</div>`);
    // novedades
    const feed = [...((fut && fut.eventos) || []).map(e => ({ ...e, texto: "Futuros · " + e.texto.split(String.fromCharCode(10))[0] })), ...((bot && bot.eventos) || []).map(e => ({ ...e, nivel: "bot", texto: "Trading · " + e.texto }))]
      .sort((a, b) => b.t - a.t).slice(0, 8);
    App.html($("#i-feed"), App.feed(feed));
  },
});
