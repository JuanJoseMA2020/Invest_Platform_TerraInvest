/* Modulo Señales: avisa si un activo va a subir o bajar hasta el proximo cuarto de hora (modelo de opciones de tiempo fijo).
   Solo avisa: la operacion la hace la persona, en la cuenta demo de la plataforma. Lleva el marcador de la prueba. */
App.senales = {
  M: DATOS.senales, VALIDA: 120000, mercado: {}, vistos: {}, pruebaOK: false, escrito: {},
  S: Object.assign({ saldo: 1000, pct: 1, pago: Math.round(100 * DATOS.senales.pago), senales: [] }, App.store.get("senales", {})),

  get H() { return this.M.horizonte_min * 60000; }, get BAR() { return this.M.vela_min * 60000; },
  guardar() { App.store.set("senales", this.S); },
  necesario(pago) { return 1 / (1 + (pago || this.S.pago) / 100); },
  monto() { return Math.max(1, Math.round(this.S.saldo * this.S.pct / 100)); },
  activas() { return this.S.senales.filter(s => s.estado === "nueva"); },

  autoprueba() {
    const t = this.M.autoprueba, p = App.modelo.probabilidad(this.M.activos[t.activo], t.velas);
    this.pruebaOK = p !== null && Math.abs(p - t.esperado) < 1e-6;
    return this.pruebaOK;
  },

  async tick() {
    const A = this.M.activos, nombres = Object.keys(A), ahora = App.api.ahora();
    const todas = await Promise.all(nombres.map(n => App.api.velas(A[n].simbolo, this.M.vela_min + "m", 300, 2500)));
    nombres.forEach((n, j) => {
      const k = todas[j], cerr = App.api.cerradas(k), ult = cerr[cerr.length - 1], a = A[n];
      const p = App.modelo.probabilidad(a, cerr);
      this.mercado[n] = { precio: +k[k.length - 1][4], velas: k, p };
      const id = n + "-" + ult[0], t0 = +ult[6] + 1;
      if (!this.pruebaOK || p === null || this.vistos[id]) return;
      this.vistos[id] = true;
      const enCuarto = new Date(t0).getUTCMinutes() % this.M.horizonte_min === 0;   // la plataforma cierra en :00 :15 :30 :45
      if (enCuarto && Math.abs(p - 0.5) >= a.umbral && ahora - t0 < this.VALIDA && !this.S.senales.some(s => s.id === id)) {
        this.S.senales.push({ id, activo: n, dir: p > 0.5 ? "SUBE" : "BAJA", t0, exp: t0 + this.H, ref: +ult[4], conf: Math.abs(p - 0.5), estado: "nueva",
                              sugerido: this.monto(), monto: null, binance: null, cierre: null, plataforma: null, pago: null, neto: null });
        if (this.S.senales.length > 5000) this.S.senales = this.S.senales.slice(-5000);
        this.guardar(); App.sonido.beep();
      }
    });
    await this.calificar();
    this.S.senales.forEach(s => { if (s.estado === "nueva" && App.api.ahora() - s.t0 > this.VALIDA) { s.estado = "paso"; this.guardar(); } });
  },

  async calificar() {   // cada señal se califica con el precio real de Binance al vencer
    for (const s of this.S.senales) {
      if (s.binance || App.api.ahora() < s.exp + 4000) continue;
      const abre = s.exp - this.BAR - 1; let k = (this.mercado[s.activo] || {}).velas || [], vela = k.find(x => +x[0] === abre);
      if (!vela) { try { k = await App.api.velas(this.M.activos[s.activo].simbolo, this.M.vela_min + "m", 5, 0, { startTime: abre, endTime: abre + this.BAR }); vela = k.find(x => +x[0] === abre); } catch (e) { /* se reintenta */ } }
      if (!vela || +vela[6] >= App.api.ahora()) continue;
      s.cierre = +vela[4];
      const sube = s.cierre > s.ref, baja = s.cierre < s.ref;
      s.binance = (s.dir === "SUBE" ? sube : baja) ? "gano" : ((sube || baja) ? "perdio" : "empate");
      this.guardar();
    }
  },

  accion(id, que, val) {
    const s = this.S.senales.find(x => x.id === id); if (!s) return;
    if (que === "entro") { const inp = document.getElementById("m-" + id); s.monto = Math.max(0, +(inp && inp.value) || s.sugerido); s.estado = "entro"; s.tClic = App.api.ahora(); }
    if (que === "paso") s.estado = "paso";
    if (que === "res") {
      s.plataforma = val; s.pago = this.S.pago;
      s.neto = val === "gano" ? s.monto * this.S.pago / 100 : (val === "perdio" ? -s.monto : 0);
      this.S.saldo = Math.round((this.S.saldo + s.neto) * 100) / 100;
    }
    this.S.modU = Date.now();   // cambio hecho por la persona: manda al unir PC y celular
    this.guardar(); App.pintarTodo();
  },

  marcador() {
    const mias = this.S.senales.filter(s => s.plataforma), g = mias.filter(s => s.plataforma === "gano").length, p = mias.filter(s => s.plataforma === "perdio").length, n = g + p;
    const pagos = mias.filter(s => s.pago).map(s => s.pago), pagoMedio = pagos.length ? pagos.reduce((a, b) => a + b, 0) / pagos.length : this.S.pago;
    const sw = this.S.senales.filter(s => s.binance), swg = sw.filter(s => s.binance === "gano").length;
    const ambas = mias.filter(s => s.binance && s.binance !== "empate" && s.plataforma !== "empate"), igual = ambas.filter(s => s.binance === s.plataforma).length;
    const z = 1.96, ph = n ? g / n : 0, bajo = n ? (ph + z * z / (2 * n) - z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / (1 + z * z / n) : 0;
    return { total: mias.length, g, p, n, acierto: n ? g / n : null, bajo, necesario: this.necesario(pagoMedio), neto: mias.reduce((a, s) => a + (s.neto || 0), 0),
             sw: sw.length, swAcierto: sw.length ? swg / sw.length : null, ambas: ambas.length, coincide: ambas.length ? igual / ambas.length : null };
  },

  resumen() {
    const m = this.marcador(), act = this.activas().length;
    return { texto: act ? `${act} señal${act > 1 ? "es" : ""} activa${act > 1 ? "s" : ""}` : (m.n ? `Acierto ${App.fmt.pct(m.acierto, 1, false)}` : "Esperando señal"),
             detalle: m.n ? `${m.n} operaciones anotadas · necesitas ${App.fmt.pct(m.necesario, 1, false)}` : "Aún no has anotado operaciones", activa: act > 0 };
  },

  tarjeta(s) {
    const a = this.M.activos[s.activo], sube = s.dir === "SUBE";
    return `<div class="signal ${sube ? "up" : "down"}">
      <div class="small mute">${a.nombre} · precio de referencia ${App.fmt.precio(s.ref)}</div>
      <div class="big">${s.activo} VA A ${sube ? "SUBIR ▲" : "BAJAR ▼"}</div>
      <div class="what">En «Tiempo» elige <span class="num">${App.fmt.hora(s.exp)}</span> · entra con <span class="num">${App.fmt.dinero(s.sugerido)}</span></div>
      <div class="bar" style="margin:12px 0 10px"><i id="b-${s.id}" style="background:var(--warn)"></i></div>
      <div class="row between"><span class="small">Válida <b id="c-${s.id}" class="num"></b> más. Si no alcanzas, déjala pasar.</span>
        <span class="row"><label class="field">Monto que pusiste<input id="m-${s.id}" type="number" min="0" step="1" value="${s.sugerido}"></label>
        <button class="btn pri" data-a="entro" data-id="${s.id}">Entré</button><button class="btn" data-a="paso" data-id="${s.id}">La dejé pasar</button></span></div></div>`;
  },
};

App.registrar({
  id: "senales", titulo: "Señales", icono: "senales", grupo: "Práctica manual",
  montar(el) {
    const N = App.senales, M = N.M, S = N.S;
    el.innerHTML = App.cabecera("Señales · sube o baja", "El software avisa; tú haces la operación en la cuenta <b>demo</b> de la plataforma.",
      `<span id="s-test" class="chip"><i></i>Autoprueba…</span><button id="s-son" class="btn sm">${App.sonido.ctx ? "Sonido activado" : "Activar sonido"}</button>`) + `
      <div class="grid g2">
        <div class="card"><h3>Tu prueba</h3><div class="row" style="margin-top:12px">
          <label class="field">Saldo demo<input id="s-saldo" type="number" min="0" step="1" value="${S.saldo}"></label>
          <label class="field">% por operación<input id="s-pct" type="number" min="0.1" max="5" step="0.1" value="${S.pct}"></label>
          <label class="field">Pago de la plataforma %<input id="s-pago" type="number" min="10" max="100" step="1" value="${S.pago}"></label></div>
          <p id="s-need" class="small mute" style="margin-top:10px"></p></div>
        <div class="card"><h3>Antes de empezar: ¿la plataforma usa el precio real?</h3>
          <p class="small mute" style="margin:4px 0 10px">Escribe el precio que muestra la plataforma. Los activos «(OTC)» casi siempre usan un precio propio y ahí las señales no sirven.</p>
          <div class="row" id="s-chk">${Object.keys(M.activos).map(n => `<label class="field">Precio de ${n}<input data-n="${n}" type="number" step="any"><span id="s-chk-${n}" class="tiny"></span></label>`).join("")}</div></div>
      </div>
      <div id="s-act" class="stack" style="margin-top:14px"></div>
      <section><div class="grid split">
        <div class="card"><div class="row between"><div class="seg" id="s-seg">${Object.keys(M.activos).map((n, i) => `<button data-n="${n}" class="${i ? "" : "on"}">${n}</button>`).join("")}</div><span class="tiny mute">Velas de ${M.vela_min} min · flechas: señales dadas</span></div><div id="s-chart" class="chart" style="margin-top:10px"></div></div>
        <div class="stack"><div id="s-assets" class="stack"></div><p id="s-next" class="small mute"></p></div>
      </div></section>
      <section><h2>Esperando resultado</h2><div id="s-open" class="stack"></div></section>
      <section><h2>Marcador</h2><div class="grid g4 kpis" style="grid-template-columns:repeat(5,minmax(0,1fr))">
        <div class="card kpi tight"><span>Tus operaciones</span><b id="k-n">0</b><span id="k-wl"></span></div>
        <div class="card kpi tight"><span>Tu acierto</span><b id="k-acc">—</b><span id="k-need"></span></div>
        <div class="card kpi tight"><span>Resultado neto</span><b id="k-pnl">—</b><span>con los montos anotados</span></div>
        <div class="card kpi tight"><span>Señales del software</span><b id="k-sw">—</b><span id="k-swn"></span></div>
        <div class="card kpi tight"><span>Plataforma = precio real</span><b id="k-ag">—</b><span id="k-agn"></span></div></div>
        <div id="s-otc" class="note bad" style="margin-top:12px" hidden></div><div id="s-ver" class="note" style="margin-top:12px"></div></section>
      <section><h2>Historial</h2><div class="card scroll"><table class="table"><thead><tr><th>Hora</th><th>Activo</th><th>Señal</th><th>Tú</th><th>Monto</th><th>Binance</th><th>Plataforma</th><th>Neto</th></tr></thead><tbody id="s-log"></tbody></table></div>
        <div class="row" style="margin-top:10px"><button id="s-csv" class="btn sm">Descargar historial (CSV)</button><button id="s-reset" class="btn sm ghost">Borrar todo</button></div></section>
      <section><div class="card"><h3>Cómo funciona y qué tan confiable es</h3><div class="small" style="margin-top:8px">
        <p>Cada cuarto de hora (:00, :15, :30, :45) el software mira las últimas velas de Binance y estima si el precio estará más alto o más bajo ${M.horizonte_min} minutos después. Solo avisa en el 10 % de momentos en que está más seguro.</p>
        <ul class="clean" style="margin:8px 0">${Object.keys(M.activos).map(n => { const a = M.activos[n]; return `<li><b>${n}</b>: acertó ${App.fmt.pct(a.acierto_prueba, 1, false)} (±${App.fmt.pct(a.error, 1, false)}) en ${a.n_prueba.toLocaleString("es-CO")} señales que nunca había visto · unas ${a.senales_dia} al día.</li>`; }).join("")}</ul>
        <p class="mute">Con pago de ${Math.round(100 * M.pago)} % se necesita más de ${App.fmt.pct(1 / (1 + M.pago), 1, false)}. La ventaja es pequeña y se midió con precios de Binance; la plataforma usa los suyos. Úsalo solo en demo hasta que el marcador diga «A favor». Modelo con datos hasta ${M.activos[Object.keys(M.activos)[0]].entrenado_hasta} UTC.</p></div></div></section>`;
    this.g = App.grafico(App.$("#s-chart", el)); this.sel = Object.keys(M.activos)[0];
    const chip = App.$("#s-test", el); chip.className = "chip " + (N.pruebaOK ? "ok" : "bad"); chip.innerHTML = `<i></i>${N.pruebaOK ? "Autoprueba correcta" : "Autoprueba fallida: sin señales"}`;
    for (const [id, k] of [["#s-saldo", "saldo"], ["#s-pct", "pct"], ["#s-pago", "pago"]]) App.$(id, el).addEventListener("input", e => { const x = +e.target.value; if (isFinite(x) && x > 0) { S[k] = x; S.modU = Date.now(); N.guardar(); this.pintar(); } });
    App.$("#s-son", el).onclick = e => { App.sonido.activar(); e.target.textContent = "Sonido activado"; };
    App.$("#s-chk", el).addEventListener("input", e => { N.escrito[e.target.dataset.n] = +e.target.value; this.pintar(); });
    App.$("#s-seg", el).onclick = e => { const b = e.target.closest("button"); if (!b) return; this.sel = b.dataset.n; el.querySelectorAll("#s-seg button").forEach(x => x.classList.toggle("on", x === b)); this.pintar(); };
    el.addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (b) N.accion(b.dataset.id, b.dataset.a === "res" ? "res" : b.dataset.a, b.dataset.v); });
    App.$("#s-csv", el).onclick = () => {
      const cols = ["id", "activo", "dir", "t0", "exp", "ref", "conf", "estado", "sugerido", "monto", "binance", "cierre", "plataforma", "pago", "neto"];
      const txt = [cols.join(",")].concat(S.senales.map(s => cols.map(c => c === "t0" || c === "exp" ? new Date(s[c]).toISOString() : (s[c] ?? "")).join(","))).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv" })); a.download = "historial_senales.csv"; a.click();
    };
    App.$("#s-reset", el).onclick = () => { if (confirm("¿Borrar todo el historial y el marcador? No se puede deshacer.")) { S.senales = []; S.borrado = S.modU = Date.now(); N.guardar(); this.pintar(); } };
    this.pintar();
  },
  pintar() {
    if (!this.montado) return;
    const N = App.senales, M = N.M, S = N.S, f = App.fmt, $ = App.$, t = App.api.ahora();
    App.texto($("#s-need"), `Con pago de ${S.pago} % hay que acertar más de ${f.pct(N.necesario(), 1, false)}. Monto sugerido ahora: ${f.dinero(N.monto())} (${S.pct} % del saldo).`);
    if (document.activeElement !== $("#s-saldo")) $("#s-saldo").value = S.saldo;
    for (const n of Object.keys(M.activos)) {
      const out = $("#s-chk-" + n), real = (N.mercado[n] || {}).precio, v = N.escrito[n];
      if (!v || !real) { App.texto(out, ""); continue; }
      const d = v / real - 1, ok = Math.abs(d) <= 0.003;
      App.texto(out, ok ? `Se parece al real (${f.pct(d, 2)}): puedes probar.` : `No se parece: ${f.pct(d, 1)} frente al real (${f.precio(real)}). Hoy NO sirve para ${n}.`); out.className = "tiny " + (ok ? "up" : "down");
    }
    const act = N.activas();
    App.html($("#s-act"), act.map(s => N.tarjeta(s)).join(""));
    act.forEach(s => { const left = N.VALIDA - (t - s.t0), b = document.getElementById("b-" + s.id), c = document.getElementById("c-" + s.id); if (b) b.style.width = Math.max(0, 100 * left / N.VALIDA) + "%"; if (c) c.textContent = f.mmss(left); });
    App.html($("#s-assets"), Object.keys(M.activos).map(n => {
      const a = M.activos[n], m = N.mercado[n] || {}, p = m.p, cerca = p == null ? 0 : Math.min(100, 100 * Math.abs(p - 0.5) / a.umbral);
      return `<div class="card tight"><div class="row between"><b>${n} <span class="mute small">${a.nombre}</span></b><span class="num">${f.precio(m.precio)}</span></div>
        <div class="small mute" style="margin:2px 0 8px">${p == null ? "Sin datos" : (cerca >= 100 ? "Con fuerza para señal" : "Sin señal clara") + " · se inclina a " + (p > 0.5 ? "subir" : "bajar")}</div>
        <div class="bar"><i style="width:${cerca.toFixed(0)}%"></i></div></div>`;
    }).join(""));
    const sig = Math.ceil(t / N.H) * N.H;
    App.texto($("#s-next"), `Próxima revisión a las ${f.hora(sig)} (en ${f.mmss(sig - t)}). Si hay señal, será para cerrar a las ${f.hora(sig + N.H)}.`);
    const pend = S.senales.filter(s => s.estado === "entro" && !s.plataforma);
    App.html($("#s-open"), pend.map(s => `<div class="card tight"><div class="row between"><span><b>${s.activo}</b> <span class="${s.dir === "SUBE" ? "up" : "down"}"><b>${s.dir}</b></span> · ${f.dinero(s.monto)} · cierra ${f.hora(s.exp)}</span>
      <span class="small mute">${s.binance ? "Según Binance: " + ({ gano: "acertó", perdio: "falló", empate: "empate" })[s.binance] : "en curso"}</span></div>
      <div class="row" style="margin-top:10px"><span class="small">¿Qué pasó en la plataforma?</span><button class="btn buy sm" data-a="res" data-v="gano" data-id="${s.id}">Gané</button>
      <button class="btn sell sm" data-a="res" data-v="perdio" data-id="${s.id}">Perdí</button><button class="btn sm" data-a="res" data-v="empate" data-id="${s.id}">Empate / devolvió</button></div></div>`).join("") || '<div class="card empty">Nada abierto.</div>');
    const m = N.marcador();
    App.texto($("#k-n"), String(m.total)); App.texto($("#k-wl"), `${m.g} ganadas · ${m.p} perdidas`);
    App.texto($("#k-acc"), m.n ? f.pct(m.acierto, 1, false) : "—"); App.texto($("#k-need"), `necesitas más de ${f.pct(m.necesario, 1, false)}`);
    App.texto($("#k-pnl"), m.total ? f.dinero(m.neto, true) : "—"); $("#k-pnl").className = m.neto > 0 ? "up" : m.neto < 0 ? "down" : "";
    App.texto($("#k-sw"), m.sw ? f.pct(m.swAcierto, 1, false) : "—"); App.texto($("#k-swn"), `${m.sw} calificadas con el precio de Binance`);
    App.texto($("#k-ag"), m.ambas ? f.pct(m.coincide, 0, false) : "—"); App.texto($("#k-agn"), `de ${m.ambas} operaciones, mismo resultado que con Binance`);
    const otc = $("#s-otc"), mal = m.ambas >= 20 && m.coincide < 0.75; otc.hidden = !mal;
    if (mal) App.html(otc, `<b>La plataforma no sigue el precio real.</b> Solo ${f.pct(m.coincide, 0, false)} de tus operaciones terminaron igual que con el precio de Binance. Estas señales no sirven para esos activos.`);
    const v = $("#s-ver");
    if (m.n < 100) { v.className = "note"; App.html(v, `<b>Todavía no se puede opinar.</b> Llevas ${m.n} operaciones con resultado; con menos de 100 cualquier cifra puede ser suerte. Faltan ${100 - m.n}.`); }
    else if (m.bajo > m.necesario) { v.className = "note good"; App.html(v, `<b>A favor.</b> Tu acierto (${f.pct(m.acierto, 1, false)}) supera lo necesario (${f.pct(m.necesario, 1, false)}) incluso en el caso pesimista (${f.pct(m.bajo, 1, false)}).`); }
    else if (m.acierto > m.necesario) { v.className = "note"; App.html(v, `<b>Aún no demostrado.</b> Tu acierto (${f.pct(m.acierto, 1, false)}) está sobre lo necesario (${f.pct(m.necesario, 1, false)}), pero todavía podría ser suerte (caso pesimista ${f.pct(m.bajo, 1, false)}). Sigue en demo.`); }
    else { v.className = "note bad"; App.html(v, `<b>No está funcionando.</b> Tu acierto (${f.pct(m.acierto, 1, false)}) no alcanza lo necesario (${f.pct(m.necesario, 1, false)}). No pases a dinero real.`); }
    const res = { gano: "acertó", perdio: "falló", empate: "empate" }, pr = { gano: "ganaste", perdio: "perdiste", empate: "empate" };
    App.html($("#s-log"), S.senales.slice().reverse().slice(0, 300).map(s => `<tr><td class="num">${f.fecha(s.t0)} ${f.hora(s.t0)}</td><td>${s.activo}</td><td class="${s.dir === "SUBE" ? "up" : "down"}"><b>${s.dir}</b></td>
      <td>${s.estado === "entro" ? "entraste" : s.estado === "paso" ? "pasó" : "activa"}</td><td class="num">${s.monto != null ? f.dinero(s.monto) : "—"}</td><td>${s.binance ? res[s.binance] : "…"}</td>
      <td>${s.plataforma ? pr[s.plataforma] : (s.estado === "entro" ? "por anotar" : "—")}</td><td class="num ${s.neto > 0 ? "up" : s.neto < 0 ? "down" : ""}">${s.neto != null ? f.dinero(s.neto, true) : "—"}</td></tr>`).join("")
      || '<tr><td colspan="8" class="empty">Aún no hay señales. Deja la página abierta: aparecen solas en cada cuarto de hora.</td></tr>');
    const mk = N.mercado[this.sel];
    if (mk && this.g) { this.g.velas(mk.velas, this.sel); this.g.marcas(S.senales.filter(s => s.activo === this.sel && s.t0 >= +mk.velas[0][0]).map(s => ({ t: s.t0 - N.BAR, sube: s.dir === "SUBE", texto: s.binance ? ({ gano: "✓", perdio: "✗", empate: "=" })[s.binance] : "" }))); }
  },
});
