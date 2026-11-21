/* Nucleo: espacio de nombres, guardado local, formato, navegacion y avisos. Sin logica de negocio. */
const App = { modulos: [], activo: null, datos: DATOS };

App.store = {
  pre: "plataforma_v1:",
  get(k, def) { try { const v = localStorage.getItem(this.pre + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v, silencioso) {
    if (!silencioso && v && typeof v === "object" && (k === "senales" || k === "futuros")) v.mod = Date.now();   // para unir PC y celular
    try { localStorage.setItem(this.pre + k, JSON.stringify(v)); } catch (e) { /* modo privado: sigue en memoria */ }
    if (!silencioso && App.nube) App.nube.cambio(k);
  },
};

App.fmt = {
  precio(x) { if (x == null || !isFinite(x)) return "—"; const a = Math.abs(x), d = a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 7; return x.toLocaleString("es-CO", { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d }); },
  dinero(x, signo) { if (x == null || !isFinite(x)) return "—"; if (Math.abs(x) < 0.005) x = 0; const s = x < 0 ? "−" : (signo && x > 0 ? "+" : ""); return s + "$" + Math.abs(x).toLocaleString("es-CO", Number.isInteger(x) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  pct(x, d = 1, signo = true) { if (x == null || !isFinite(x)) return "—"; if (Math.abs(100 * x) < 0.5 * 10 ** -d) x = 0; return (signo && x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(100 * x).toFixed(d).replace(".", ",") + " %"; },
  hora(t) { return new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }); },
  fecha(t) { return new Date(t).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }); },
  fechaHora(t) { return t ? this.fecha(t) + " " + this.hora(t) : "—"; },
  dia(t) { return new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" }); },
  hace(t) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; },
  usdt(x, signo) { if (x == null || !isFinite(x)) return "—"; if (Math.abs(x) < 0.005) x = 0; const s = x < 0 ? "−" : (signo && x > 0 ? "+" : ""); return s + Math.abs(x).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"; },
  falta(ms) { ms = Math.max(0, ms); const m = Math.floor(ms / 60000); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : this.mmss(ms); },
  mmss(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); },
};

App.$ = (sel, root) => (root || document).querySelector(sel);
App.html = (el, html) => { if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } };   // solo toca el DOM si cambio
App.texto = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
App.esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

App.ico = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>',
  trading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5.5-6 4 3.5L20 6"/><path d="M15 6h5v5"/></svg>',
  senales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.2"/><path d="M7.5 16.5a6.4 6.4 0 0 1 0-9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 19.4a10.5 10.5 0 0 1 0-14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/></svg>',
  futuros: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 8h0M17 4v16"/><rect x="4.5" y="7" width="5" height="7" rx="1"/><rect x="14.5" y="10" width="5" height="7" rx="1"/></svg>',
  rendimientos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="9" cy="7" rx="6" ry="2.6"/><path d="M3 7v4.5c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7"/><path d="M9 14.1v3.4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4.5c0-1.4-2.7-2.6-6-2.6"/></svg>',
  guia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 12h5"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h0M15 13h0M9.5 16.5h5"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-6 4 4 7-9"/></svg>',
};

App.registrar = mod => App.modulos.push(mod);

App.COLORES = { BTC: "#f7931a", ETH: "#627eea", SOL: "#14f195", XRP: "#23292f", BNB: "#f3ba2f", DOGE: "#c2a633", ADA: "#0033ad", LINK: "#2a5ada", SUI: "#4da2ff", NEAR: "#00c08b", ZEC: "#ecb244", HYPE: "#50d2c1", UNI: "#ff007a", TRX: "#ff060a" };
App.coin = base => { const c = App.COLORES[base] || `hsl(${[...base].reduce((a, ch) => a + ch.charCodeAt(0) * 37, 0) % 360} 55% 45%)`; return `<span class="coin"><i style="background:${c}">${App.esc(base.slice(0, 3))}</i>${App.esc(base)}</span>`; };
App.riesgo = n => `<span class="riesgo r${n}" title="Riesgo ${n} de 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
App.limpioHtml = s => App.esc(s)   // los avisos traen el formato de Telegram: negrilla, cursiva y detalle plegado
  .replace(/&lt;(\/?)(b|i)&gt;/g, "<$1$2>")
  .replace(/&lt;blockquote[^&]*&gt;/g, '<span class="faint">').replace(/&lt;\/blockquote&gt;/g, "</span>")
  .replace(/^──+$/gm, "");
App.feed = items => items.length ? `<div class="feed">${items.map(e => `<div class="it"><span class="b ${e.nivel || ""}"></span><div class="x">${App.limpioHtml(e.texto)}</div><span class="t">${App.fmt.fechaHora(e.t)}</span></div>`).join("")}</div>` : '<div class="empty">Sin novedades todavía.</div>';

App.ir = id => {
  const mod = App.modulos.find(m => m.id === id) || App.modulos[0];
  App.activo = mod;
  if (location.hash !== "#/" + mod.id) history.replaceState(null, "", "#/" + mod.id);
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("on", b.dataset.id === mod.id));
  document.querySelectorAll(".vista").forEach(v => { v.hidden = v.dataset.id !== mod.id; });
  if (!mod.montado) { mod.montado = true; try { mod.montar(App.$(`.vista[data-id="${mod.id}"]`)); } catch (e) { console.error(e); } }
  if (mod.mostrar) mod.mostrar();
  window.scrollTo(0, 0);
};

App.toast = msg => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); };

App.sonido = {
  ctx: null,
  activar() { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); this.beep(); App.store.set("sonido", true); },
  beep() {
    if (!this.ctx) return;
    for (let j = 0; j < 3; j++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime + j * 0.25;
      o.frequency.value = 880; o.connect(g); g.connect(this.ctx.destination);
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.start(t); o.stop(t + 0.2);
    }
  },
};

App.cabecera = (titulo, sub, chips) => `<div class="top"><div><h1>${titulo}</h1><p>${sub}</p></div><div class="chips">${chips || ""}</div></div>`;

Object.assign(App.ico, {
  crecimiento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  ojoNo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  luna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  bajar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
});

/* Avisos del navegador (señales): llegan aunque la pestaña esté en segundo plano. */
App.pedirAvisos = () => { try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) { /* no disponible */ } };
App.notificar = (titulo, texto) => {
  try { if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification(titulo, { body: texto, tag: titulo }); } catch (e) { /* no disponible */ }
};

/* Preferencias de la persona: tema, modo privado e instalación como app. */
App.prefs = {
  TEMAS: ["sistema", "claro", "oscuro"],
  tema() { return App.store.get("tema", "sistema"); },
  montar() {
    const bt = document.getElementById("b-tema"), bp = document.getElementById("b-privado"), bi = document.getElementById("b-instalar");
    const pintar = () => {
      const t = this.tema(); bt.innerHTML = App.ico[{ sistema: "auto", claro: "sol", oscuro: "luna" }[t]]; bt.title = "Tema: " + t + " (clic para cambiar)";
      const p = App.store.get("privado", false); document.body.classList.toggle("privado", p); bp.innerHTML = App.ico[p ? "ojoNo" : "ojo"]; bp.classList.toggle("on", p);
      bp.title = p ? "Mostrar cifras" : "Ocultar cifras (para mostrar la pantalla)";
    };
    bt.onclick = () => { const t = this.TEMAS[(this.TEMAS.indexOf(this.tema()) + 1) % 3]; App.store.set("tema", t); location.reload(); };   // recarga: los gráficos toman los colores nuevos
    bp.onclick = () => { App.store.set("privado", !App.store.get("privado", false)); pintar(); };
    bi.innerHTML = App.ico.bajar;
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); this.instalar = e; bi.hidden = false; });
    bi.onclick = async () => { if (!this.instalar) return; this.instalar.prompt(); await this.instalar.userChoice; this.instalar = null; bi.hidden = true; };
    if (location.protocol === "https:" && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    pintar();
  },
};

/* Copia de los datos de la persona en un archivo (marcador de señales y simulador). */
App.descargarDatos = () => {
  const d = { app: "TerraInvest", fecha: new Date().toISOString(), senales: App.store.get("senales", null), futuros: App.store.get("futuros", null) };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }));
  a.download = `terrainvest-mis-datos-${d.fecha.slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
