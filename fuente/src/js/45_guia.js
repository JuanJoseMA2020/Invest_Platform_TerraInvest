/* Modulo Guia: para que sirve cada parte de TerraInvest y como usarla, en lenguaje simple. Solo texto. */
App.registrar({
  id: "guia", titulo: "Guía", icono: "guia", grupo: "Ayuda",
  montar(el) {
    const mods = [
      { id: "inicio", ico: "inicio", c: "", t: "Inicio", para: "Ver en un vistazo cómo van tus dos bots comparados con Bitcoin, y lo último que hicieron.",
        como: ["Mira la gráfica: la línea azul es el bot de trading, la morada el de futuros y la naranja punteada Bitcoin.", "Las tarjetas de abajo te llevan a cada módulo.", "«Últimas novedades» resume lo que los bots hicieron (se actualiza cada 15 minutos)."],
        ojo: "Si arriba dice «Servidor sin reportar», los bots siguen trabajando, pero la página no recibe su estado. Avísame." },
      { id: "trading", ico: "trading", c: "", t: "Bot de trading", para: "El bot original. Compra monedas que entran en tendencia y las vende cuando la tendencia se rompe. Trabaja solo, en la cuenta de práctica de Binance.",
        como: ["Arriba ves su cuenta real: patrimonio, ganado/perdido, posiciones abiertas y últimas operaciones.", "Abajo ves «lo que el bot ve»: las 10 monedas del mes, cuáles están en tendencia y a qué precio compraría o vendería.", "Toca una moneda de la tabla para ver su gráfico con los niveles de compra (verde) y venta (rojo)."],
        ojo: "Si Bitcoin está bajo su media de 100 días, el bot se queda en efectivo a propósito: así evita las caídas grandes. No es un error." },
      { id: "futuros", ico: "futuros", c: "v", t: "Bot de futuros", para: "Un segundo bot, separado del primero. Apuesta a que las monedas suben (largo) cuando el mercado está fuerte, o a que bajan (corto) cuando está débil. Opera solo en la cuenta demo de Binance.",
        como: ["Pestaña «Bot automático»: su patrimonio, posiciones con su stop y su precio de liquidación, historial y bitácora (todo lo que hizo y por qué).", "Pestaña «Simulador manual»: practica tú mismo con 1.000 USDT de mentira, para entender largo, corto y apalancamiento.", "Pestaña «Financiación y estudio»: la tasa que se pagan comprados y vendidos cada 8 horas, y lo que mostró el estudio."],
        ojo: "Decide una vez al día (7:00 p. m. de Colombia). Sus avisos llegan a SU chat de Telegram, distinto del bot de trading." },
      { id: "rendimientos", ico: "rendimientos", c: "t", t: "Rendimientos", para: "Opciones para ganar intereses con dinero quieto (por ejemplo, el efectivo del bot cuando no está invirtiendo), con la tasa de hoy y su riesgo.",
        como: ["Cada tarjeta muestra la tasa al año, su historia, qué tan fácil es usarla y el riesgo (barras: verde bajo, amarillo medio, rojo alto).", "Usa la calculadora para ver cuánto ganarías con un monto y un plazo.", "Lee «Cómo lo usaría yo»: el orden sugerido, de lo más simple a lo más complejo."],
        ojo: "Es información: este módulo no mueve dinero. Desconfía de tasas altas que no sabes de dónde salen." },
      { id: "senales", ico: "senales", c: "a", t: "Señales", para: "Avisos de «sube» o «baja» para BTC y ETH en los próximos 15 minutos, para probar a mano en la cuenta demo de una plataforma de opciones (tipo Binomo).",
        como: ["Deja la página abierta: cuando hay señal suena y aparece un aviso grande.", "Antes de operar, compara el precio de la plataforma con el real. Si no coincide (pasa con los «OTC», sobre todo los fines de semana), no operes.", "Opera solo cierres de cuarto de hora (:00, :15, :30, :45) y anota si entraste y si ganaste: el marcador dice si vale la pena."],
        ojo: "Para ganar con pago del 80 % hay que acertar más del 55,6 %. Siempre en demo hasta que el marcador diga «A favor»." },
    ];
    const glosario = [
      ["Largo", "Apostar a que el precio sube."], ["Corto", "Apostar a que el precio baja."],
      ["Stop", "Salida automática si la operación va mal. Lo guarda Binance, así funciona aunque el bot o el servidor se apaguen."],
      ["Apalancamiento", "Mover más dinero del que pones. Con 2x pones 50 y mueves 100: ganas y pierdes el doble."],
      ["Liquidación", "Si el precio va muy en tu contra, Binance cierra la apuesta y pierdes lo que pusiste. El bot pone el stop mucho antes."],
      ["Margen aislado", "Cada apuesta arriesga solo su propio dinero, no el resto de la cuenta."],
      ["Financiación", "Pago cada 8 horas entre comprados y vendidos en futuros. Si es positiva, pagan los comprados."],
      ["Tendencia", "Cuando una moneda rompe su máximo (o mínimo) de varias semanas, suele seguir en esa dirección un tiempo."],
      ["Media de 100 días", "El precio promedio de Bitcoin en los últimos 100 días. Encima: mercado fuerte. Debajo: débil."],
      ["Cuenta demo / papel", "Demo: cuenta de práctica de Binance con dinero ficticio. Papel: simulación sin cuenta. Ninguna usa dinero real."],
      ["APY (tasa al año)", "Cuánto rinde algo en un año, con interés compuesto."], ["Staking", "Prestar tus monedas para validar una red y recibir más monedas a cambio."],
    ];
    const faq = [
      ["¿Algo de esto mueve mi dinero real?", "No. Los dos bots operan en la cuenta de práctica de Binance y la página no puede enviar órdenes. Pasar a dinero real solo ocurre si tú lo pides con esas palabras."],
      ["¿Por qué el bot de trading lleva días sin comprar?", "Porque Bitcoin está bajo su media de 100 días. En esos momentos el bot espera en efectivo; así evitó las caídas grandes en las pruebas. Mientras tanto, el bot de futuros sí opera (apostando a la baja)."],
      ["¿Cómo veo lo mismo en el PC y en el celular?", "Lo de los bots siempre es igual en todos lados (viene del servidor). Para tu marcador de señales y el simulador, pulsa el botón de arriba «guardar en la nube», conecta tu GitHub una vez y escanea el código QR con el celular."],
      ["¿Qué hago si llega un aviso de error a Telegram?", "Nada urgente: los stops están guardados en Binance. Cuéntame qué dice el aviso y lo reviso."],
      ["¿Cada cuánto debo mirar esto?", "No hace falta mirar a diario. Sugerencia: lee los avisos de Telegram cuando lleguen, mira Inicio una vez por semana y, el día 1 de cada mes, las monedas nuevas."],
      ["¿Puedo tenerla como una app en el celular?", "Sí. Abre el enlace en Chrome (Android) o Safari (iPhone) y elige «Agregar a pantalla de inicio» o «Instalar». En el PC aparece un botón con una flecha hacia abajo arriba a la derecha."],
      ["¿Qué son los botones de arriba?", "El ojo oculta las cifras (útil si alguien ve tu pantalla). El de la pantalla, el sol o la luna cambia el tema: automático, claro u oscuro. El aviso de la nube guarda tus datos en tu GitHub."],
      ["¿Cómo me entero de una señal si no estoy mirando?", "En Señales pulsa «Activar sonido y avisos» y acepta el permiso: el navegador te avisa aunque estés en otra pestaña."],
      ["¿Cuándo pasar a dinero real?", "Cuando haya varios meses de resultados en demo que se parezcan a lo esperado (trading +7 a +13 % al año; futuros, alrededor de +9 %). Empezar con poco y con la misma configuración."],
    ];
    el.innerHTML = App.cabecera("Guía de TerraInvest", "Para qué sirve cada parte, cómo usarla y qué significan las palabras raras.", "") + `
      <div class="card hero"><div class="row top0" style="gap:16px"><div class="ico">${App.ico.guia}</div><div class="grow">
        <h3 style="font-size:18px">TerraInvest en una frase</h3>
        <p class="mute" style="margin-top:6px">Es tu tablero de inversiones alternativas: dos bots que operan solos en cuentas de práctica, un lugar para comparar formas de ganar intereses y una herramienta de señales para practicar a mano. Todo lo ves aquí, en el PC o en el celular.</p>
        <div class="row" style="margin-top:12px">${mods.map(m => `<a class="chip" href="#g-${m.id}">${m.t}</a>`).join("")}<a class="chip" href="#g-glosario">Glosario</a><a class="chip" href="#g-faq">Preguntas</a><a class="chip" href="#g-donde">Dónde vive cada cosa</a></div></div></div></div>
      <section><h2>Los módulos</h2><div class="stack">${mods.map(m => `
        <div class="card" id="g-${m.id}"><div class="row between top0"><div class="row top0" style="gap:14px"><div class="ico ${m.c}">${App.ico[m.ico]}</div><div><h3 style="font-size:17px">${m.t}</h3><p class="mute small" style="margin-top:3px;max-width:760px">${m.para}</p></div></div>
          <button class="btn sm" data-ir="${m.id}">Abrir →</button></div>
          <div class="grid g2" style="margin-top:14px"><div><div class="eyebrow" style="margin-bottom:8px">Cómo usarlo</div><ol class="steps">${m.como.map(x => `<li><div>${x}</div></li>`).join("")}</ol></div>
            <div><div class="eyebrow" style="margin-bottom:8px">Ten en cuenta</div><div class="note info small">${m.ojo}</div></div></div></div>`).join("")}</div></section>
      <section id="g-glosario"><h2>Glosario</h2><div class="card"><div class="grid g2">${glosario.map(([a, b]) => `<div><b>${a}</b><p class="small mute" style="margin-top:2px">${b}</p></div>`).join("")}</div></div></section>
      <section id="g-faq"><h2>Preguntas frecuentes</h2><div class="card">${faq.map(([q, a], i) => `<details class="more" ${i ? "" : 'style="border-top:0;margin-top:0;padding-top:0"'}><summary><b style="color:var(--text)">${q}</b></summary><p class="small">${a}</p></details>`).join("")}</div></section>
      <section id="g-donde"><h2>Dónde vive cada cosa</h2><div class="grid g3">
        <div class="card"><div class="eyebrow">Servidor (AWS)</div><h3 style="margin-top:4px">Los bots trabajan aquí</h3><ul class="clean small" style="margin-top:10px">
          <li><b>Bot de trading</b>: su carpeta, su base de datos y su chat de Telegram.</li><li><b>Bot de futuros y la página</b>: otra carpeta, otra base de datos y otro chat. No comparten nada.</li>
          <li>Copias de las bases: cada día en el servidor y cada semana a Telegram.</li></ul></div>
        <div class="card"><div class="eyebrow">GitHub</div><h3 style="margin-top:4px">La página y el código</h3><ul class="clean small" style="margin-top:10px">
          <li><b>Invest_Platform_TerraInvest</b> (público): esta página.</li><li><b>TerraInvest-bot</b> (privado): todo el código de los bots, sin claves.</li>
          <li>Tu nota privada (gist) con el marcador de señales, si conectas la nube.</li></ul></div>
        <div class="card"><div class="eyebrow">Tu PC</div><h3 style="margin-top:4px">Carpeta «Bot de Trading»</h3><ul class="clean small" style="margin-top:10px">
          <li>Mapa en «00 LEEME», documentos, copias de la base y esta página («08 PLATAFORMA WEB»).</li><li>Las claves NO están en GitHub: guárdalas en un gestor de contraseñas.</li></ul></div>
      </div></section>
      <p class="disclaimer">TerraInvest es una herramienta personal de estudio y práctica. No es asesoría financiera.</p>`;
    el.addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) App.ir(b.dataset.ir); const a = e.target.closest('a[href^="#g-"]'); if (a) { e.preventDefault(); document.querySelector(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" }); } });
  },
  pintar() {},
});
