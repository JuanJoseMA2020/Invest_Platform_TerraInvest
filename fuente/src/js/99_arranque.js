/* Arranque: arma la navegacion, enciende los relojes y mantiene vivos los datos de cada modulo. */
App.pintarTodo = () => { try { if (App.activo && App.activo.pintar) App.activo.pintar(); App.bandera(); } catch (e) { console.error(e); } };

App.bandera = () => {   // aviso global: una señal activa se ve desde cualquier modulo
  const act = App.senales.activas(), nav = document.querySelector('.nav[data-id="senales"]');
  let b = nav.querySelector(".badge");
  if (act.length && !b) { b = document.createElement("span"); b.className = "badge"; nav.appendChild(b); }
  if (b) { if (act.length) b.textContent = act.length; else b.remove(); }
  const fuera = act.length && App.activo && App.activo.id !== "senales";
  App.html(document.getElementById("bandera"), fuera ? act.map(s => `<div class="signal banner ${s.dir === "SUBE" ? "up" : "down"}"><div class="row between"><b>${s.activo} VA A ${s.dir === "SUBE" ? "SUBIR ▲" : "BAJAR ▼"} · cierra ${App.fmt.hora(s.exp)}</b><span class="small">Ver señal →</span></div></div>`).join("") : "");
  document.title = act.length ? `▶ ${act[0].activo} ${act[0].dir} · Señal` : "Plataforma";
};

(async () => {
  const nav = document.getElementById("nav");
  nav.innerHTML = App.modulos.map(m => `<button class="nav" data-id="${m.id}">${App.ico[m.icono]}<span>${m.titulo}</span></button>`).join("");
  nav.addEventListener("click", e => { const b = e.target.closest(".nav"); if (b) App.ir(b.dataset.id); });
  document.getElementById("bandera").addEventListener("click", () => App.ir("senales"));
  document.getElementById("vistas").innerHTML = App.modulos.map(m => `<div class="vista" data-id="${m.id}" hidden></div>`).join("");
  App.senales.autoprueba();
  window.addEventListener("hashchange", () => App.ir(location.hash.replace("#/", "")));
  App.ir(location.hash.replace("#/", "") || "inicio");
  await App.api.sincronizar();
  const seguro = fn => async () => { try { await fn(); } catch (e) { /* sin conexion: se reintenta en el siguiente ciclo */ } App.pintarTodo(); };
  const enFut = () => App.activo.id === "futuros";
  const tSen = seguro(() => App.senales.tick()), tTra = seguro(() => App.trading.actualizar());
  const tFut = seguro(() => (enFut() || App.activo.id === "inicio" || App.futuros.S.abiertas.length) ? App.futuros.tick(false) : null);
  const tRad = seguro(() => enFut() ? App.futuros.cargarRadar() : null);
  tSen(); tTra(); tFut();
  setInterval(tSen, 4000); setInterval(tFut, 5000); setInterval(tTra, 60000); setInterval(tRad, 60000);
  setInterval(() => { const m = App.modulos.find(x => x.id === "trading"); if (m.montado) m.reloj(); if (App.activo.id === "senales") App.pintarTodo(); else App.bandera(); }, 1000);
})();
