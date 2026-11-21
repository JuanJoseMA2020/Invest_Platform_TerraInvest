/* Arranque: arma la navegacion, enciende los relojes y mantiene vivos los datos de cada modulo. */
App.pintarTodo = () => { try { if (App.activo && App.activo.pintar) App.activo.pintar(); App.bandera(); } catch (e) { console.error(e); } };

App.bandera = () => {   // aviso global: una señal activa se ve desde cualquier modulo
  const act = App.senales.activas(), nav = document.querySelector('.nav[data-id="senales"]');
  let b = nav.querySelector(".badge");
  if (act.length && !b) { b = document.createElement("span"); b.className = "badge"; nav.appendChild(b); }
  if (b) { if (act.length) b.textContent = act.length; else b.remove(); }
  const fuera = act.length && App.activo && App.activo.id !== "senales";
  App.html(document.getElementById("bandera"), fuera ? act.map(s => `<div class="signal banner ${s.dir === "SUBE" ? "up" : "down"}"><div class="row between"><b>${s.activo} VA A ${s.dir === "SUBE" ? "SUBIR ▲" : "BAJAR ▼"} · cierra ${App.fmt.hora(s.exp)}</b><span class="small">Ver señal →</span></div></div>`).join("") : "");
  document.title = act.length ? `▶ ${act[0].activo} ${act[0].dir} · Señal` : "TerraInvest";
};

(async () => {
  const ORDEN = ["inicio", "trading", "futuros", "rendimientos", "senales", "crecimiento", "guia"];
  App.modulos.sort((a, b) => ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id));
  const nav = document.getElementById("nav");
  let grupo = null;
  nav.innerHTML = App.modulos.map(m => {
    const cab = m.grupo && m.grupo !== grupo ? `<div class="navt">${m.grupo}</div>` : "";
    grupo = m.grupo || grupo;
    return cab + `<button class="nav" data-id="${m.id}">${App.ico[m.icono]}<span class="t-lg">${m.titulo}</span><span class="t-sm">${m.corto || m.titulo}</span>${m.nuevo ? '<span class="pill">NUEVO</span>' : ""}</button>`;
  }).join("");
  nav.addEventListener("click", e => { const b = e.target.closest(".nav"); if (b) App.ir(b.dataset.id); });
  document.getElementById("bandera").addEventListener("click", () => App.ir("senales"));
  document.getElementById("vistas").innerHTML = App.modulos.map(m => `<div class="vista" data-id="${m.id}" hidden></div>`).join("");
  App.senales.autoprueba();
  App.prefs.montar();
  document.addEventListener("click", e => { if (e.target.closest("[data-nube]")) App.nube.ventana(); });
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* el navegador decide */ }
  if (!App.nube.leerEnlace()) App.nube.bajar();
  App.nube.pintar();
  setInterval(() => { if (App.nube.token && document.visibilityState === "visible") App.nube.bajar(); }, 300000);
  document.addEventListener("visibilitychange", () => { if (!App.nube.token) return; if (document.visibilityState === "visible") { if (Date.now() - App.nube.ultimo > 60000) App.nube.bajar(); } else App.nube.subir(true); });
  window.addEventListener("hashchange", () => App.ir(location.hash.replace("#/", "")));
  App.ir(location.hash.replace("#/", "") || "inicio");
  App.ticker.reloj();
  await App.api.sincronizar();
  const seguro = fn => async () => { try { await fn(); } catch (e) { /* sin conexion: se reintenta en el siguiente ciclo */ } App.pintarTodo(); };
  const en = (...ids) => ids.includes(App.activo.id);
  const tSen = seguro(() => App.senales.tick()), tTra = seguro(() => App.trading.actualizar());
  const tFut = seguro(() => (en("futuros", "inicio", "rendimientos") || App.futuros.S.abiertas.length) ? App.futuros.tick(false) : null);
  const tRad = seguro(() => en("futuros") ? App.futuros.cargarRadar() : null);
  const tEst = seguro(() => App.estado.cargar()), tTick = seguro(() => App.ticker.tick());
  tEst().then(() => { const m = App.modulos.find(x => x.id === "inicio"); if (m.montado) m.cargarBtc(); });
  tTick(); tSen(); tTra(); tFut();
  setInterval(tSen, 4000); setInterval(tFut, 5000); setInterval(tTick, 10000); setInterval(tTra, 60000); setInterval(tRad, 60000); setInterval(tEst, 60000);
  setInterval(() => { App.ticker.reloj(); const m = App.modulos.find(x => x.id === "trading"); if (m.montado) m.reloj(); if (en("senales", "futuros")) App.pintarTodo(); else App.bandera(); }, 1000);
})();
