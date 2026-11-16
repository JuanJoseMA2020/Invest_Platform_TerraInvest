/* Guardado en la nube: los datos de la persona (marcador de señales, simulador) se guardan en una nota PRIVADA (gist secreto)
   de su propia cuenta de GitHub, asi se ven iguales en el PC y en el celular y no se pierden si el navegador se borra.
   La llave (token de GitHub, solo con permiso de «Gists») queda en cada dispositivo; nunca se publica ni sale de ahi. */
App.nube = {
  API: "https://api.github.com", ARCHIVO: "terrainvest.json", DESC: "TerraInvest · datos (privado)",
  CLAVES: ["senales", "futuros"],
  estado: "apagada", error: null, ultimo: 0, subiendo: null, firmaSubida: "", ultimaSubida: 0,
  espera: +(App.store.get("nube_espera", 0)) || 0,   // GitHub pidio una pausa: no se le consulta antes de esta hora
  MIN_SUBIDA: 60000,                                 // como maximo una subida por minuto (GitHub limita las consultas)
  get token() { return App.store.get("nube_token", ""); },
  get gist() { return App.store.get("nube_gist", ""); },

  async pedir(metodo, ruta, cuerpo) {
    if (Date.now() < this.espera) { const e = new Error(`GitHub pidió una pausa. Vuelvo a sincronizar a las ${App.fmt.hora(this.espera)}; mientras tanto todo queda guardado en este dispositivo.`); e.pausa = true; throw e; }
    const r = await fetch(this.API + ruta, { method: metodo, cache: "no-store",
      headers: { Authorization: "Bearer " + this.token, Accept: "application/vnd.github+json", ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (r.ok) return r.json();
    let msg = ""; try { msg = (await r.json()).message || ""; } catch (e) { /* sin detalle */ }
    if (r.status === 429 || /rate limit/i.test(msg)) {   // limite de consultas: se espera hasta que GitHub lo reinicie
      const reinicio = +(r.headers.get("x-ratelimit-reset") || 0) * 1000;
      this.espera = Math.max(reinicio, Date.now() + 5 * 60000); App.store.set("nube_espera", this.espera);
      const e = new Error(`GitHub pidió una pausa por muchas consultas. Vuelvo a sincronizar a las ${App.fmt.hora(this.espera)}; mientras tanto todo queda guardado en este dispositivo.`);
      e.pausa = true; throw e;
    }
    const err = new Error(r.status === 401 ? "La llave de GitHub no sirve o venció (revisa que la copiaste completa)"
      : (r.status === 403 || r.status === 404) ? `GitHub no dio permiso (${r.status}${msg ? ": " + msg : ""}). La llave necesita la casilla «gist».`
      : `GitHub respondió ${r.status}${msg ? ": " + msg : ""}`);
    err.status = r.status; throw err;
  },

  local() { const d = {}; this.CLAVES.forEach(k => { d[k] = App.store.get(k, null); }); return d; },

  /* Une lo de este dispositivo con lo de la nube sin perder nada:
     - señales: union por id; si las dos tienen la misma, gana la que tiene mas informacion anotada
     - saldo, ajustes y simulador: gana el mas reciente */
  unir(a, b) {
    if (!a) return b; if (!b) return a;
    const out = {};
    const senA = a.senales, senB = b.senales;
    if (senA || senB) {
      const hecho = s => s.modU || 0;   // el saldo y los ajustes los decide el ultimo cambio hecho a mano
      const base = !senA ? senB : !senB ? senA : (hecho(senA) !== hecho(senB) ? (hecho(senA) > hecho(senB) ? senA : senB) : ((senA.mod || 0) >= (senB.mod || 0) ? senA : senB));
      const borrado = Math.max((senA && senA.borrado) || 0, (senB && senB.borrado) || 0);
      const peso = s => (s.plataforma ? 8 : 0) + (s.estado === "entro" ? 4 : 0) + (s.estado === "paso" ? 2 : 0) + (s.binance ? 1 : 0);
      const todas = new Map();
      [...((senA && senA.senales) || []), ...((senB && senB.senales) || [])].forEach(s => { const y = todas.get(s.id); if (!y || peso(s) > peso(y)) todas.set(s.id, s); });
      out.senales = { ...base, borrado, senales: [...todas.values()].filter(s => s.t0 > borrado).sort((x, y) => x.t0 - y.t0).slice(-5000) };
    }
    const fa = a.futuros, fb = b.futuros;
    out.futuros = !fa ? fb : !fb ? fa : ((fa.mod || 0) >= (fb.mod || 0) ? fa : fb);
    return out;
  },

  aplicar(d) {   // pone los datos unidos en la pagina y en este dispositivo
    if (d.senales) { App.store.set("senales", d.senales, true); App.senales.S = Object.assign(App.senales.S, d.senales); }
    if (d.futuros) { App.store.set("futuros", d.futuros, true); App.futuros.S = Object.assign({ saldo: 1000, inicial: 1000, abiertas: [], cerradas: [] }, d.futuros); }
  },

  async buscarGist() {
    if (this.gist) return this.gist;
    const lista = await this.pedir("GET", "/gists?per_page=100");
    let g = lista.find(x => x.description === this.DESC && x.files && x.files[this.ARCHIVO]);
    if (!g) g = await this.pedir("POST", "/gists", { description: this.DESC, public: false, files: { [this.ARCHIVO]: { content: JSON.stringify({ v: 1, ...this.local() }) } } });
    App.store.set("nube_gist", g.id);
    return g.id;
  },

  async bajar() {
    if (!this.token) return;
    try {
      let id = await this.buscarGist(), g;
      try { g = await this.pedir("GET", "/gists/" + id); } catch (e) {   // la nota guardada ya no existe: se busca o crea otra
        if (e.status !== 404) throw e;
        App.store.set("nube_gist", ""); id = await this.buscarGist(); g = await this.pedir("GET", "/gists/" + id);
      }
      const f = g.files[this.ARCHIVO];
      let remoto = null;
      if (f) remoto = JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content);
      const unido = this.unir(this.local(), remoto);
      this.aplicar(unido);
      this.estado = "ok"; this.error = null; this.ultimo = Date.now();
      if (JSON.stringify(unido) !== JSON.stringify({ senales: remoto && remoto.senales, futuros: remoto && remoto.futuros })) this.programar(5000);
    } catch (e) { this.estado = "error"; this.error = e.message; this.llaveMala = !e.pausa && (e.status === 401 || e.status === 403); }
    App.pintarTodo(); this.pintar();
  },

  async subir(forzar) {
    if (!this.token) return;
    const datos = { v: 1, ...this.local() }, firma = JSON.stringify(datos);
    if (firma === this.firmaSubida) return;
    const falta = this.ultimaSubida + this.MIN_SUBIDA - Date.now();
    if (falta > 0 && !forzar) { this.programar(falta); return; }
    this.ultimaSubida = Date.now();
    try {
      const id = await this.buscarGist();
      await this.pedir("PATCH", "/gists/" + id, { files: { [this.ARCHIVO]: { content: firma } } });
      this.firmaSubida = firma; this.estado = "ok"; this.error = null; this.ultimo = Date.now();
    } catch (e) { this.estado = "error"; this.error = e.message; }
    this.pintar();
  },

  programar(ms) { if (this.subiendo && ms == null) return; clearTimeout(this.subiendo); this.subiendo = setTimeout(() => { this.subiendo = null; this.subir(); }, ms == null ? 20000 : ms); },
  cambio(k) { if (this.token && this.CLAVES.includes(k)) this.programar(); },

  async conectar(token) {
    this.llaveMala = false; this.espera = 0; App.store.set("nube_espera", 0);
    App.store.set("nube_token", token.trim()); App.store.set("nube_gist", "");
    this.estado = "conectando"; this.pintar();
    await this.bajar();
    if (this.estado === "ok") App.toast("Conectado: tus datos se guardan en tu GitHub");
  },
  desconectar() { App.store.set("nube_token", ""); App.store.set("nube_gist", ""); this.estado = "apagada"; this.pintar(); },

  enlace() { return location.origin.startsWith("http") ? `${location.origin}${location.pathname}#nube=${encodeURIComponent(this.token)}` : `https://juanjosema2020.github.io/Invest_Platform_TerraInvest/#nube=${encodeURIComponent(this.token)}`; },
  leerEnlace() {   // el celular se conecta escaneando el QR del PC: la llave viene en el enlace y se borra de la barra en el acto
    const m = location.hash.match(/nube=([^&]+)/);
    if (!m) return false;
    history.replaceState(null, "", location.pathname + "#/inicio");
    this.conectar(decodeURIComponent(m[1]));
    return true;
  },

  chip() {
    if (!this.token) return '<button class="chip warn" data-nube><i></i>Tus datos solo en este dispositivo · guardar en la nube</button>';
    if (this.estado === "error" && Date.now() < this.espera) return `<button class="chip warn" data-nube><i></i>Nube en pausa hasta las ${App.fmt.hora(this.espera)} · datos guardados aquí</button>`;
    if (this.estado === "error") return `<button class="chip bad" data-nube><i></i>Nube: ${App.esc(this.error)}</button>`;
    if (this.estado !== "ok") return '<button class="chip" data-nube><i></i>Conectando con la nube…</button>';
    return `<button class="chip ok" data-nube><i></i>Guardado en la nube · ${App.fmt.hace(this.ultimo)}</button>`;
  },
  pintar() { App.html(document.getElementById("nube"), this.chip()); if (this.abierta) this.ventana(); },

  ventana() {
    this.abierta = true;
    let v = document.getElementById("nube-v");
    if (!v) { v = document.createElement("div"); v.id = "nube-v"; v.className = "modal"; document.body.appendChild(v); v.addEventListener("click", e => this.clic(e)); }
    const con = !!this.token && !(this.estado === "error" && this.llaveMala);   // llave borrada o sin permiso: se pide otra
    v.innerHTML = `<div class="card dlg"><div class="row between"><h3>Guardar tus datos en la nube</h3><button class="btn sm ghost" data-x>Cerrar</button></div>
      <p class="sub" style="margin-top:6px">El marcador de señales y el simulador se guardan en una nota <b>privada</b> de tu cuenta de GitHub. Así ves lo mismo en el PC y en el celular, y no se pierde nada si el navegador se borra. Lo de los bots no necesita esto: siempre viene del servidor.</p>
      ${con ? `<div class="note ${this.estado === "error" ? "bad" : "good"} small" style="margin-top:12px">${this.estado === "error" ? App.esc(this.error) : "Conectado. Última sincronización " + App.fmt.hace(this.ultimo) + "."}</div>
        <h3 style="margin-top:18px">Conectar el celular</h3><p class="small mute">Escanea este código con la cámara del celular. Abre la página ya conectada (usa el navegador normal, no el de Telegram o WhatsApp).</p>
        <div class="row" style="margin-top:10px;align-items:flex-start"><div id="nube-qr" class="qr"></div><p class="tiny faint" style="max-width:260px">El código lleva tu llave de GitHub: no le tomes foto ni lo compartas. Solo sirve para leer y escribir tus notas privadas.</p></div>
        <div class="row" style="margin-top:14px"><button class="btn sm" data-sync>Sincronizar ahora</button><button class="btn sm ghost" data-off>Desconectar este dispositivo</button></div>`
      : `<ol class="steps" style="margin-top:14px">
          <li><div>Entra a <a href="https://github.com/settings/tokens/new?scopes=gist&description=TerraInvest%20datos" target="_blank" rel="noopener">github.com › Settings › Developer settings › Tokens (classic) › Generate new token (classic)</a>. El enlace ya deja todo listo.</div></li>
          <li><div>Revisa: nombre <b>TerraInvest datos</b>, vencimiento <b>No expiration</b> (o el más largo) y marcada <b>solo</b> la casilla <b>gist</b>. Ninguna otra.</div></li>
          <li><div>Baja y pulsa <b>Generate token</b>. Copia la llave (empieza por <b>ghp_</b>) y pégala aquí, solo en esta página, nunca en un chat.</div></li></ol>
        ${this.token ? `<div class="note bad small" style="margin-top:12px">${App.esc(this.error || "")} Crea una llave nueva y pégala abajo.</div>` : ""}
        <div class="row" style="margin-top:14px"><label class="field grow">Llave de GitHub<input id="nube-tok" type="password" autocomplete="off" placeholder="ghp_…" style="width:100%"></label><button class="btn pri" data-on style="align-self:flex-end">Conectar</button></div>`}</div>`;
    if (con && window.qrcode) { const q = qrcode(0, "M"); q.addData(this.enlace()); q.make(); document.getElementById("nube-qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 3, scalable: true }); }
  },
  clic(e) {
    const t = e.target;
    if (t.id === "nube-v" || t.closest("[data-x]")) { this.abierta = false; document.getElementById("nube-v").remove(); return; }
    if (t.closest("[data-on]")) { const v = document.getElementById("nube-tok").value; if (v.trim().length > 20) this.conectar(v); else App.toast("Esa llave parece incompleta"); }
    if (t.closest("[data-off]")) this.desconectar();
    if (t.closest("[data-sync]")) this.bajar();
  },
};
