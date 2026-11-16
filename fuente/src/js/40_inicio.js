/* Modulo Inicio: vista general de los tres modulos. */
App.registrar({
  id: "inicio", titulo: "Inicio", icono: "inicio",
  montar(el) {
    const mods = [["trading", "Trading", "El bot compra lo que entra en tendencia y vende cuando se rompe. Opera solo en el servidor."],
                  ["senales", "Señales", "Te avisa si BTC o ETH van a subir o bajar hasta el próximo cuarto de hora. Tú operas en demo."],
                  ["futuros", "Futuros", "Simulador de futuros de Binance: largo, corto, apalancamiento y liquidación, sin dinero real."]];
    el.innerHTML = App.cabecera("Tu plataforma", "Trading con el bot, señales para operar a mano y un simulador de futuros. Todo separado.", '<span id="i-conn" class="chip"><i></i>Conectando…</span>') + `
      <div class="card hero"><div class="row between"><div><div class="tiny mute" style="letter-spacing:.09em;text-transform:uppercase">Bitcoin ahora</div>
        <div class="row" style="align-items:baseline;gap:12px;margin-top:2px"><span id="i-btc" class="num" style="font-size:38px;font-weight:650;letter-spacing:-.03em">—</span><span id="i-chg" class="num"></span></div>
        <div id="i-reg" class="small mute" style="margin-top:4px"></div></div>
        <div id="i-chart" style="height:120px;flex:1;min-width:240px;max-width:520px"></div></div></div>
      <section><h2>Módulos</h2><div class="grid g3">
        ${mods.map(([id, t, d]) => `<div class="card mod" data-ir="${id}"><div class="row between"><div class="ico">${App.ico[id]}</div><span id="i-${id}-tag" class="chip"><i></i>…</span></div>
            <h3>${t}</h3><p class="small mute">${d}</p><div style="margin-top:auto"><b id="i-${id}-a" style="font-size:17px;letter-spacing:-.01em"></b><div id="i-${id}-b" class="tiny mute"></div></div></div>`).join("")}
      </div></section>
      <section><div class="note info small"><b>Cómo leer esto.</b> Trading es lo único que mueve dinero (hoy en la cuenta de práctica de Binance) y lo hace el bot por su cuenta. Señales y Futuros son herramientas de prueba: no envían órdenes a ninguna parte.</div></section>`;
    el.addEventListener("click", e => { const c = e.target.closest("[data-ir]"); if (c) App.ir(c.dataset.ir); });
    this.pintar();
  },
  pintar() {
    if (!this.montado) return;
    const $ = App.$, f = App.fmt, T = App.trading, conn = $("#i-conn");
    conn.className = "chip " + (App.api.ok ? "ok" : "bad"); App.html(conn, `<i></i>${App.api.ok ? "Datos en vivo · " + f.hora(App.api.ahora()) : "Sin conexión con Binance"}`);
    const fila = T.filas.find(x => x.sym === "BTCUSDT"), precio = fila ? fila.precio : (App.senales.mercado.BTC || {}).precio;
    if (precio) App.texto($("#i-btc"), "$" + f.precio(precio));
    if (T.listo) {
      const k = fila && fila.velas;
      if (k) { const d = +k[k.length - 1][4] / +k[k.length - 7][4] - 1; App.texto($("#i-chg"), f.pct(d, 2) + " en 24 h"); $("#i-chg").className = "num " + (d >= 0 ? "up" : "down"); }
      App.texto($("#i-reg"), T.btc.sano ? `Sobre su media de ${T.cfg.gate_dias} días (${f.pct(T.btc.dist, 1)}): mercado favorable para el bot.` : `Bajo su media de ${T.cfg.gate_dias} días (${f.pct(T.btc.dist, 1)}): el bot espera en efectivo.`);
      if (k && !this.spark && window.LightweightCharts) {
        const c = LightweightCharts.createChart($("#i-chart"), { autoSize: true, layout: { background: { color: "transparent" }, textColor: "transparent", attributionLogo: false }, grid: { vertLines: { visible: false }, horzLines: { visible: false } },
          rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { vertLine: { visible: false }, horzLine: { visible: false } } });
        this.spark = c.addAreaSeries({ lineColor: "#5b8cff", topColor: "rgba(91,140,255,.35)", bottomColor: "rgba(91,140,255,0)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        this.spark.setData(k.slice(-180).map(x => ({ time: Math.floor(+x[0] / 1000), value: +x[4] }))); c.timeScale().fitContent();
      }
    }
    const pon = (id, r, cls) => { App.texto($(`#i-${id}-a`), r.texto); App.texto($(`#i-${id}-b`), r.detalle); const t = $(`#i-${id}-tag`); t.className = "chip " + cls[0]; App.html(t, `<i></i>${cls[1]}`); };
    const rt = T.resumen(); pon("trading", rt, !T.listo ? ["", "Cargando"] : rt.sano ? ["ok", "Operando"] : ["", "En efectivo"]);
    const rs = App.senales.resumen(); pon("senales", rs, rs.activa ? ["bad", "Señal activa"] : ["info", "Vigilando"]);
    pon("futuros", App.futuros.resumen(), ["info", "Simulación"]);
  },
});
