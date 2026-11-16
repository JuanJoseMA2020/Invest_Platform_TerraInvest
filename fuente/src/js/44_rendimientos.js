/* Modulo Rendimientos: donde poner a ganar intereses el dinero quieto. Tasas reales (DefiLlama, Binance) publicadas por el
   servidor una vez al dia; la tasa neutral de BTC se recalcula en vivo con la financiacion de Binance. */
App.rendimientos = {
  filtro: "todos",
  opciones() {
    const r = App.estado.rend, ops = r && r.opciones ? r.opciones.map(o => ({ ...o })) : [];
    const b = App.futuros.mercado.BTCUSDT, carry = ops.find(o => o.id === "carry_btc");
    if (b && carry) { carry.vivo = b.tasa * 3 * 365 / 2; }
    return ops;
  },
  tasa(o) { return o.vivo != null ? o.vivo : o.apy; },
  mejor() {   // la mejor en dolares con riesgo bajo
    return this.opciones().filter(o => o.moneda === "USD" && o.riesgo <= 2 && isFinite(o.apy)).sort((a, b) => b.apy - a.apy)[0];
  },
  resumen() {
    const m = this.mejor();
    return m ? { texto: `Hasta ${App.fmt.pct(m.apy, 1, false)} al año`, detalle: `en dólares con riesgo bajo · ${m.nombre}` } : { texto: "Cargando tasas…", detalle: "" };
  },
};

App.rendimientosTesoreria = function () {
  const $ = App.$, f = App.fmt, T = App.estado.d && App.estado.d.tesoreria;
  if (!T || T.ganado == null) { App.texto($("#r-tnota"), "La tesorería empieza a medir en el próximo ciclo del servidor (máximo 15 minutos)."); return; }
  App.texto($("#r-tg"), f.usdt(T.ganado)); App.texto($("#r-tgs"), `en ${f.falta(T.dias_corridos * 864e5)} · ~${f.usdt(T.anual_estimado)} al año a este ritmo`);
  App.texto($("#r-tc"), f.usdt(T.caja)); App.texto($("#r-tt"), f.pct(T.tasa, 2, false));
  const tr = (T.tramos || [])[0]; App.texto($("#r-tts"), tr ? `${f.pct(T.base, 2, false)} base + ${f.pct(tr.extra, 0, false)} extra hasta ${f.dinero(tr.hasta)}` : "tasa base");
  App.texto($("#r-tnota"), `Medido desde ${f.fechaHora(T.inicio)}. La tasa extra es una promoción de Binance y puede cambiar.`);
  let acum = 0; const serie = (T.dias || []).map(([dia, g]) => { acum += g; return [Date.parse(dia + "T12:00:00Z"), acum]; });
  const firma = App.estado.d.actualizado;
  if (this.tchart && firma !== this.tfirma && serie.length) { this.tfirma = firma; this.tchart.poner([{ color: "#2dd4bf", area: true, datos: serie }]); }
  App.html($("#r-ttasas"), Object.entries(T.tasas || {}).map(([a, t]) => `<tr><td>${App.coin(a)}</td><td class="num">${f.pct(t.base, 2, false)}</td>
    <td class="num">${t.tramos && t.tramos.length ? `+${f.pct(t.tramos[0].extra, 0, false)} hasta ${f.dinero(t.tramos[0].hasta)}` : "—"}</td></tr>`).join(""));
  App.html($("#r-tfeed"), App.feed(T.eventos || []));
};

App.registrar({
  id: "rendimientos", titulo: "Rendimientos", icono: "rendimientos", grupo: "Invertir", nuevo: true,
  montar(el) {
    el.innerHTML = App.cabecera("Rendimientos · renta pasiva", "Formas reales de poner a ganar intereses el dinero que está quieto, con su tasa de hoy y su riesgo explicado.", '<span id="r-chip" class="chip info"><i></i>Tasas del día</span>') + `
      <div class="grid g4 kpis">
        <div class="card kpi"><span>Mejor en dólares, riesgo bajo</span><b id="r-k1" class="up">—</b><span id="r-k1s"></span></div>
        <div class="card kpi"><span>Binance Simple Earn (USDT)</span><b id="r-k2">—</b><span id="r-k2s"></span></div>
        <div class="card kpi"><span>Neutral con futuros de BTC, hoy</span><b id="r-k3">—</b><span>al año, cambia cada 8 horas</span></div>
        <div class="card kpi"><span>Bot de trading (esperado)</span><b>7–13 %</b><span>al año, con riesgo de precio</span></div>
      </div>
      <section><h2>Tesorería automática · el efectivo del bot trabajando</h2>
        <div class="grid split">
          <div class="card glow"><div class="row between top0"><div><div class="eyebrow">Simulada con datos reales</div><h3 style="margin-top:4px;font-size:18px">Lo que habría ganado el efectivo quieto del bot</h3></div><span id="r-tchip" class="chip info"><i></i>Simulada</span></div>
            <div class="grid g3" style="margin-top:14px">
              <div class="kpi"><span>Ganado hasta hoy</span><b id="r-tg" class="num up">—</b><span id="r-tgs"></span></div>
              <div class="kpi"><span>Efectivo del bot ahora</span><b id="r-tc" class="num">—</b><span>todo estaría en Simple Earn</span></div>
              <div class="kpi"><span>Tasa que recibiría hoy</span><b id="r-tt" class="num">—</b><span id="r-tts"></span></div></div>
            <div id="r-tchart" class="chart sm" style="margin-top:12px"></div>
            <p class="tiny faint" id="r-tnota" style="margin-top:6px"></p></div>
          <div class="card"><h3>Cómo funcionaría con dinero real</h3><p class="sub">La cuenta demo de Binance no tiene Simple Earn: por eso hoy se simula, con el efectivo y la tasa reales.</p>
            <ol class="steps" style="margin-top:12px">
              <li><div>Todo el efectivo que el bot no está usando va a <b>Simple Earn flexible</b> (USDT) y gana intereses cada día.</div></li>
              <li><div>Cuando el bot quiere comprar, <b>rescata solo lo necesario</b>: en flexible el rescate es inmediato.</div></li>
              <li><div>Cuando vende, <b>vuelve a invertir</b> lo que liberó.</div></li>
              <li><div>Si Binance tarda en rescatar, el bot no compra esa vez: nunca opera sin tener el dinero.</div></li></ol>
            <div class="note info small" style="margin-top:12px">Se enciende solo cuando digas «pasa a dinero real». Riesgo: el mismo de tener el dinero en Binance.</div>
            <div class="scroll" style="margin-top:12px"><table class="table"><thead><tr><th>Simple Earn flexible hoy</th><th class="num">Base</th><th class="num">Extra (tramo)</th></tr></thead><tbody id="r-ttasas"></tbody></table></div></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>Movimientos que habría hecho</h3><div id="r-tfeed" style="margin-top:6px;max-height:260px;overflow:auto"></div></div></section>
      <section><div class="row between" style="margin-bottom:12px"><div class="seg" id="r-seg"><button data-f="todos" class="on">Todas</button><button data-f="USD">En dólares</button><button data-f="staking">Staking</button></div>
        <span class="tiny faint" id="r-act"></span></div>
        <div class="grid g3" id="r-ops"></div></section>
      <section><div class="grid split2">
        <div class="card"><h3>Calculadora</h3><p class="sub">Cuánto ganarías con la tasa de hoy (con interés compuesto).</p>
          <div class="row" style="margin-top:12px"><label class="field">Monto (USD)<input id="r-monto" type="number" min="0" step="50" value="1000"></label>
            <label class="field">Meses<input id="r-meses" type="number" min="1" max="120" step="1" value="12"></label></div>
          <div class="scroll" style="margin-top:10px"><table class="table"><thead><tr><th>Opción</th><th class="num">Tasa</th><th class="num">Ganas</th><th class="num">Total</th></tr></thead><tbody id="r-calc"></tbody></table></div>
          <p class="tiny faint" style="margin-top:8px">En staking la ganancia es en ETH o SOL: el total en dólares sube o baja con el precio de la moneda.</p></div>
        <div class="card"><h3>Cómo lo usaría yo</h3><p class="sub">Un orden sensato, de lo más simple a lo más complejo.</p>
          <ol class="steps" style="margin-top:14px">
            <li><div><b>El dinero quieto del bot, a Simple Earn flexible.</b> El bot pasa semanas en efectivo cuando Bitcoin está débil (como ahora). En Simple Earn ese efectivo gana intereses y se saca al instante cuando el bot quiere comprar. Con dinero real, el bot lo puede hacer solo.</div></li>
            <li><div><b>Ahorro en dólares a meses o años: bonos del Tesoro tokenizados o Sky (sUSDS).</b> Rinden lo que pagan los bonos de EE. UU. (~3,5–4 %). Necesitan una billetera propia: es el siguiente paso cuando quieras aprenderlo.</div></li>
            <li><div><b>Staking solo de monedas que ya quieras tener.</b> Si vas a guardar ETH o SOL de todos modos, que ganen 2–5 % extra. No compres una moneda solo por el staking.</div></li>
            <li><div><b>Desconfía de tasas altas sin explicación.</b> En 2022 Terra/Luna pagaba 20 % en dólares y se derrumbó en una semana. Si no sabes de dónde sale el interés, el producto eres tú.</div></li>
          </ol></div>
      </div></section>
      <p class="disclaimer" id="r-fuentes"></p>`;
    App.$("#r-seg", el).onclick = ev => { const b = ev.target.closest("button"); if (!b) return; App.rendimientos.filtro = b.dataset.f; el.querySelectorAll("#r-seg button").forEach(x => x.classList.toggle("on", x === b)); this.firma = null; this.pintar(); };
    ["#r-monto", "#r-meses"].forEach(id => App.$(id, el).addEventListener("input", () => this.pintar()));
    this.tchart = App.lineas(App.$("#r-tchart", el), { formato: x => x.toFixed(2) + " USDT" });
    this.pintar();
  },
  pintarTesoreria() { App.rendimientosTesoreria.call(this); },
  mostrar() { App.futuros.tick(false).then(() => this.pintar()).catch(() => {}); },
  pintar() {
    if (!this.montado) return;
    const $ = App.$, f = App.fmt, R = App.rendimientos, ops = R.opciones(), d = App.estado.rend;
    this.pintarTesoreria();
    if (!ops.length) { App.html($("#r-ops"), '<div class="card empty">Cargando tasas…</div>'); return; }
    const m = R.mejor(), earn = ops.find(o => o.id === "binance_earn"), carry = ops.find(o => o.id === "carry_btc");
    if (m) { App.texto($("#r-k1"), f.pct(m.apy, 2, false)); App.texto($("#r-k1s"), m.nombre); }
    if (earn) { App.texto($("#r-k2"), f.pct(earn.apy, 1, false) + " + " + f.pct(earn.fijo.extra, 0, false)); App.texto($("#r-k2s"), `extra hasta ${earn.fijo.extra_hasta} USDT · ${earn.fijo.fecha}`); }
    if (carry) { const t = R.tasa(carry); App.texto($("#r-k3"), f.pct(t, 1)); $("#r-k3").className = t >= 0 ? "up" : "down"; }
    if (d && d.actualizado) App.texto($("#r-act"), "Tasas actualizadas " + f.hace(d.actualizado));
    const vis = ops.filter(o => R.filtro === "todos" || (R.filtro === "USD" ? o.moneda === "USD" : o.tipo === "Staking"));
    const firma = R.filtro + "|" + (d && d.actualizado) + "|" + (carry && carry.vivo != null ? carry.vivo.toFixed(5) : "");
    if (firma !== this.firma) {
      this.firma = firma;
      App.html($("#r-ops"), vis.map(o => {
        const t = R.tasa(o), color = o.riesgo <= 2 ? "#22c58b" : o.riesgo === 3 ? "#f5b544" : "#f4566b";
        return `<div class="card opc"><div class="row between top0"><div><div class="eyebrow">${App.esc(o.tipo)} · ${o.moneda === "USD" ? "en dólares" : "en " + o.moneda}</div><h3 style="margin-top:3px">${App.esc(o.nombre)}</h3></div>${App.riesgo(o.riesgo)}</div>
          <div class="row" style="align-items:baseline;gap:8px"><span class="apy ${t >= 0 ? "" : "down"}">${t == null ? "—" : f.pct(t, 2, false).replace("−", "−")}</span><span class="small mute">al año${o.vivo != null ? " (hoy)" : ""}</span></div>
          ${o.media30 != null && o.id !== "binance_earn" ? `<div class="tiny mute">Promedio de 30 días: <b class="num">${f.pct(o.media30, 2, false)}</b>${o.tvl ? ` · ${f.dinero(Math.round(o.tvl / 1e6))} millones depositados` : ""}</div>` : ""}
          ${o.fijo ? `<div class="tiny mute">+${f.pct(o.fijo.extra, 0, false)} extra en los primeros ${o.fijo.extra_hasta} USDT · última tasa publicada (${o.fijo.fecha})</div>` : ""}
          <div class="spark" data-id="${o.id}" data-color="${color}" style="height:44px"></div>
          <dl><dt>Acceso</dt><dd>${App.esc(o.acceso)}</dd><dt>Retiro</dt><dd>${App.esc(o.liquidez)}</dd></dl>
          <p class="small">${App.esc(o.como)}</p><p class="tiny" style="color:#f7b9c2"><b>Cuidado:</b> ${App.esc(o.cuidado)}</p></div>`;
      }).join(""));
      vis.forEach(o => { const s = el => el && o.serie && o.serie.length > 1 && App.spark(el, o.serie.map(([mes, v]) => ({ time: Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1, 1) / 1000, value: 100 * v })), el.dataset.color); s($(`.spark[data-id="${o.id}"]`)); });
      App.html($("#r-fuentes"), `Fuentes: tasas diarias de <a href="https://defillama.com/yields" target="_blank" rel="noopener">DefiLlama</a>, financiación de <a href="https://www.binance.com/es/futures/funding-history/perpetual/funding-fee-history" target="_blank" rel="noopener">Binance</a> y el <a href="${earn ? earn.fijo.fuente : "#"}" target="_blank" rel="noopener">anuncio de Simple Earn</a>. Las tasas cambian todos los días. Nada de esto es asesoría financiera.`);
    }
    const monto = +$("#r-monto").value || 0, meses = Math.max(1, +$("#r-meses").value || 12);
    App.html($("#r-calc"), ops.filter(o => R.tasa(o) != null).sort((a, b) => R.tasa(b) - R.tasa(a)).map(o => {
      let t = R.tasa(o);
      if (o.id === "binance_earn") { const extra = Math.min(monto, o.fijo.extra_hasta) * o.fijo.extra; t = monto ? o.apy + extra / monto : o.apy; }
      const total = monto * Math.pow(1 + t, meses / 12), gan = total - monto;
      return `<tr><td class="wrap small">${App.esc(o.nombre)}${o.moneda !== "USD" ? ' <span class="tag wait">en ' + o.moneda + "</span>" : ""}</td><td class="num">${f.pct(t, 2, false)}</td><td class="num ${gan >= 0 ? "up" : "down"}">${f.dinero(gan, true)}</td><td class="num">${f.dinero(total)}</td></tr>`;
    }).join(""));
  },
});
