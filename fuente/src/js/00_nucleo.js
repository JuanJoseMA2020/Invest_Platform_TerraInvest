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
  precio(x) { if (x == null || !isFinite(x)) return "—"; const a = Math.abs(x), d = a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6; return x.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }); },
  dinero(x, signo) { if (x == null || !isFinite(x)) return "—"; const s = x < 0 ? "−" : (signo && x > 0 ? "+" : ""); return s + "$" + Math.abs(x).toLocaleString("es-CO", Number.isInteger(x) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  pct(x, d = 1, signo = true) { if (x == null || !isFinite(x)) return "—"; return (signo && x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(100 * x).toFixed(d).replace(".", ",") + " %"; },
  hora(t) { return new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }); },
  fecha(t) { return new Date(t).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }); },
  fechaHora(t) { return t ? this.fecha(t) + " " + this.hora(t) : "—"; },
  dia(t) { return new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" }); },
  hace(t) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; },
  usdt(x, signo) { if (x == null || !isFinite(x)) return "—"; const s = x < 0 ? "−" : (signo && x > 0 ? "+" : ""); return s + Math.abs(x).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"; },
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
App.limpioHtml = s => App.esc(s).replace(/&lt;(\/?)b&gt;/g, "<$1b>");   // los avisos traen negrillas de Telegram
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
