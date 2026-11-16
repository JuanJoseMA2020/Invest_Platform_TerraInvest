/* Modulo Crecimiento: el plan de ahorro (calculadora) y el mapa de mejoras futuras, con ejemplos en numeros y su estado.
   Solo informacion y planeacion: no mueve dinero. Los estados se cambian aqui cuando el dueño decide. */
App.crecimiento = {
  ESTADOS: { propuesta: ["info", "Propuesta"], discusion: ["warn", "En discusión"], aprobada: ["ok", "Aprobada"], hecha: ["ok", "Implementada"], descartada: ["", "Descartada"] },
  IDEAS: [
    { n: 2, estado: "propuesta", prioridad: "1.º", t: "Plan de aportes automático", c: "t", ico: "rendimientos",
      que: "Separar un monto fijo cada mes (por ejemplo 50 USDT) y repartirlo entre los bots y la tesorería, siempre el mismo día.",
      ejemplo: "Empiezas con 150 USDT y aportas 50 al mes. En 1 año habrás puesto 750 USDT; con un rendimiento prudente (+8 % al año) tendrías ~784. En 3 años: 1.950 puestos → ~2.207. En 5 años: 3.150 puestos → ~3.868. Lo que más se nota son tus aportes: el rendimiento suma encima.",
      cuanto: "Entre 5 % y 10 % de lo que ahorras cada mes. Si ahorras 500 USD al mes, entre 25 y 50 USDT.",
      riesgo: "Ninguno adicional. El riesgo es el de los bots donde cae el dinero.",
      pagina: "Calculadora (abajo), recordatorio el día del aporte y gráfica de lo aportado frente a lo ganado." },
    { n: 1, estado: "propuesta", prioridad: "2.º", t: "Escalera de compra en pánico (BTC y ETH)", c: "", ico: "trading",
      que: "Una bolsa aparte que compra Bitcoin en 3 tramos iguales solo cuando cae fuerte desde su máximo: −30 %, −45 % y −60 %. Luego espera la recuperación sin vender por miedo. Mientras espera, el dinero gana en Simple Earn.",
      ejemplo: "Bolsa de 300 USDT, si el máximo de Bitcoin fue 100.000: compra 100 USDT a 70.000, 100 a 55.000 y 100 a 40.000 (precio medio ~52.200). Si Bitcoin vuelve a 100.000, la bolsa vale ~575 USDT (+92 %); si llega a 120.000, ~690 (+130 %). Si solo se llenó el primer tramo y vuelve a 100.000: 100 → 143. Caso malo: cae a −75 % y se queda ahí por 2 años: la bolsa vale ~144 hasta que se recupere.",
      cuanto: "Una bolsa que no vayas a necesitar en 3 años: por ejemplo 20 USDT de cada aporte mensual, hasta juntar 300.",
      riesgo: "Meses o años en rojo antes de la recuperación. Históricamente (2015, 2018, 2022) Bitcoin se multiplicó por 3 a 5 desde esos pisos, pero el pasado no garantiza el futuro.",
      pagina: "Medidor «qué tan barato está Bitcoin» frente a su máximo, aviso al tocar cada tramo y seguimiento de la bolsa." },
    { n: 3, estado: "propuesta", prioridad: "2.º", t: "Inversión Dual de Binance", c: "v", ico: "futuros",
      que: "Le dices a Binance «compro BTC si baja a X precio» por unos días. Mientras esperas, te paga un rendimiento alto. Si el precio llega, compras más barato; si no, te quedas con tu dinero más el premio.",
      ejemplo: "Bitcoin a 65.000. Pones 100 USDT a «comprar si baja a 60.000» por 7 días con 30 % anual: ganas ~0,58 USDT en esa semana. Si Bitcoin cierra en 62.000, recibes 100,58 USDT. Si cierra en 58.000, recibes BTC comprado a 60.000. Repitiéndolo, puede rendir 15–30 % al año mientras esperas la escalera de pánico.",
      cuanto: "Solo dinero de la bolsa de pánico (idea 1). Nunca el del bot de trading.",
      riesgo: "Si Bitcoin cae muy por debajo de tu precio, igual compras a ese precio (no al más bajo).",
      pagina: "Ofertas del día y calculadora «cuánto cobrarías por esperar»." },
    { n: 4, estado: "propuesta", prioridad: "3.º", t: "Modo turbo en mercados alcistas", c: "v", ico: "bot",
      que: "Cuando Bitcoin está claramente en tendencia alcista, el bot de futuros usa 2x en largos sobre BTC y ETH. Fuera de esa condición vuelve a lo normal.",
      ejemplo: "Ilustrativo (aún sin medir): con 500 USDT, en un año alcista donde el bot normal gane +30 %, el turbo podría dar +50 a +60 % (250–300 USDT). Si el mercado se da vuelta, una caída normal de −15 % podría ser −30 %.",
      cuanto: "Solo con 500 USDT o más en futuros, y solo si el laboratorio lo valida.",
      riesgo: "Caídas más profundas. Hay que medirlo con datos de 2020 a 2026 antes de encenderlo.",
      pagina: "Indicador «turbo encendido o apagado» y su resultado separado." },
    { n: 5, estado: "propuesta", prioridad: "4.º", t: "Launchpool y airdrops de Binance", c: "a", ico: "senales",
      que: "Si tienes BNB o FDUSD guardados, Binance te regala tokens nuevos durante sus lanzamientos. A veces esos tokens valen bastante el día que salen.",
      ejemplo: "100 USDT en BNB durante un lanzamiento de 10 días con 20 % anual: ~0,55 USDT en tokens nuevos. Son premios pequeños y sorpresa; algunos lanzamientos pagan mucho más, otros casi nada.",
      cuanto: "Poco: 50–100 USDT en BNB, que además baja comisiones del bot.",
      riesgo: "El precio del BNB, y que muchos tokens nuevos caen después de salir.",
      pagina: "Calendario de lanzamientos, aviso para participar y registro de lo ganado." },
  ],
  proyectar(ini, mes, anual, meses) {
    const r = Math.pow(1 + anual, 1 / 12) - 1, out = []; let v = ini, ap = ini;
    for (let i = 0; i <= meses; i++) { if (i) { v = v * (1 + r) + mes; ap += mes; } out.push({ i, v, ap }); }
    return out;
  },
};

App.registrar({
  id: "crecimiento", titulo: "Crecimiento", icono: "crecimiento", grupo: "Planear", nuevo: true,
  montar(el) {
    const C = App.crecimiento;
    el.innerHTML = App.cabecera("Crecimiento · plan y mejoras futuras", "Cuánto invertir, tu plan de ahorro y las ideas para hacer crecer el capital, con ejemplos en números. Todo en un solo lugar.", '<span class="chip info"><i></i>Para decidir juntos</span>') + `
      <div class="card"><div class="row top0" style="gap:16px"><div class="ico">${App.ico.escudo}</div><div class="grow">
        <h3 style="font-size:17px">La verdad sobre los «saltos» de capital</h3>
        <p class="mute" style="margin-top:6px">Los saltos visibles vienen de dos fuentes: <b>aportar más dinero</b> o <b>tomar más riesgo en un momento elegido</b>. Con 150 USDT, un mes excelente de +5 % son 7,50 USDT; con 50 USDT de aporte mensual, en un año tienes 600 USDT más. Por eso el plan empieza por el ahorro, y los saltos de riesgo se usan solo con una parte pequeña y cuando el mercado da la oportunidad.</p></div></div></div>

      <section><h2>¿Cuánto invertir?</h2><div class="grid g3">
        <div class="card"><div class="eyebrow">Paso 1</div><h3 style="margin-top:4px">Primero, tu colchón</h3><p class="small mute" style="margin-top:6px">Antes de TerraInvest, ten un fondo de emergencia de 3 a 6 meses de gastos en algo seguro (cuenta de ahorro, fondo). TerraInvest nunca debe ser el dinero del mes.</p></div>
        <div class="card"><div class="eyebrow">Paso 2</div><h3 style="margin-top:4px">Máximo 5–10 % de tus ahorros</h3><p class="small mute" style="margin-top:6px">Si tus ahorros e inversiones suman 10.000 USD, en TerraInvest entre 500 y 1.000 USD. Si suman 3.000 USD, entre 150 y 300. Así, aunque cripto caiga 50 %, tu patrimonio total baja apenas 2,5–5 %.</p></div>
        <div class="card"><div class="eyebrow">Paso 3</div><h3 style="margin-top:4px">Aporte mensual: 5–10 % de lo que ahorras</h3><p class="small mute" style="margin-top:6px">Si ahorras 500 USD al mes, entre 25 y 50 USDT para TerraInvest, siempre el mismo día. La constancia pesa más que el monto.</p></div>
      </div></section>

      <section><h2>Tu plan de ahorro</h2><div class="grid split">
        <div class="card"><div class="row" style="gap:12px">
            <label class="field">Empiezas con (USDT)<input id="c-ini" type="number" min="0" step="10" value="150"></label>
            <label class="field">Aporte mensual<input id="c-mes" type="number" min="0" step="10" value="50"></label>
            <label class="field">Años<input id="c-anos" type="number" min="1" max="20" step="1" value="5"></label></div>
          <div class="legend" style="margin-top:14px"><span><i style="background:var(--faint)"></i>Solo lo que aportas</span><span><i style="background:#3b6cf6"></i>Prudente (+8 % al año)</span><span><i style="background:#0f9d6a"></i>Esperado (+13 % al año)</span></div>
          <div id="c-chart" class="chart md" style="margin-top:8px"></div></div>
        <div class="card"><h3>Resultado</h3><div class="scroll" style="margin-top:8px"><table class="table"><thead><tr><th>Plazo</th><th class="num">Aportado</th><th class="num">Prudente</th><th class="num">Esperado</th></tr></thead><tbody id="c-tabla"></tbody></table></div>
          <p class="tiny faint" style="margin-top:8px">Prudente y esperado salen de las pruebas del bot de trading (+7 % a +13 % al año). Habrá años en rojo: esto es un promedio, no una promesa.</p>
          <h3 style="margin-top:18px">Cómo repartir (sugerido)</h3>
          <table class="table" style="margin-top:6px"><tbody>
            <tr><td class="wrap">Bot de trading (con tesorería para el efectivo quieto)</td><td class="num">60 %</td></tr>
            <tr><td class="wrap">Bolsa de pánico (en Simple Earn hasta que toque comprar)</td><td class="num">40 %</td></tr>
            <tr><td class="wrap">Bot de futuros con dinero real</td><td class="num wrap">al pasar 500 USDT</td></tr></tbody></table>
          <p class="small" id="c-reparto" style="margin-top:8px"></p></div>
      </div></section>

      <section><h2>Mejoras futuras · ideas para crecer</h2><p class="mute small" style="margin:-6px 0 14px">Ordenadas por prioridad recomendada. Ninguna está activa: se deciden juntos y se suben a la plataforma una por una.</p>
        <div class="stack">${C.IDEAS.slice().sort((a, b) => a.prioridad.localeCompare(b.prioridad)).map(x => { const [cls, txt] = C.ESTADOS[x.estado]; return `
          <div class="card"><div class="row between top0"><div class="row top0" style="gap:14px"><div class="ico ${x.c}">${App.ico[x.ico]}</div>
              <div><div class="eyebrow">Prioridad ${x.prioridad}</div><h3 style="font-size:17px;margin-top:2px">${x.t}</h3></div></div>
            <span class="chip ${cls}"><i></i>${txt}</span></div>
            <p style="margin-top:12px">${x.que}</p>
            <div class="note info small" style="margin-top:12px"><b>Ejemplo:</b> ${x.ejemplo}</div>
            <div class="grid g3" style="margin-top:14px">
              <div><div class="eyebrow">Cuánto poner</div><p class="small" style="margin-top:4px">${x.cuanto}</p></div>
              <div><div class="eyebrow">Riesgo</div><p class="small cuidado" style="margin-top:4px">${x.riesgo}</p></div>
              <div><div class="eyebrow">En TerraInvest se vería</div><p class="small" style="margin-top:4px">${x.pagina}</p></div></div></div>`; }).join("")}</div></section>

      <section><h2>Hoja de ruta</h2><div class="card"><ol class="steps">
        <li><div><b>Noviembre – diciembre 2026:</b> bots en demo, tesorería simulada, informe mensual el 1 de diciembre.</div></li>
        <li><div><b>Enero 2027:</b> depositas ~150 USDT. Al decir «pasa a dinero real»: bot de trading + tesorería en Simple Earn. Empieza el plan de aportes.</div></li>
        <li><div><b>Febrero – marzo 2027:</b> bolsa de pánico (idea 1) con parte de los aportes; Inversión Dual (idea 3) para cobrar mientras espera.</div></li>
        <li><div><b>Al pasar 500 USDT:</b> bot de futuros con dinero real; medir el modo turbo (idea 4).</div></li>
        <li><div><b>Siempre:</b> informe mensual, frenos de pérdida y la regla de oro: primero proteger, después ganar.</div></li></ol></div></section>
      <p class="disclaimer">Ejemplos ilustrativos con supuestos explicados; no son promesas ni asesoría personalizada. Las criptomonedas pueden perder gran parte de su valor.</p>`;
    this.g = App.lineas(App.$("#c-chart", el), { formato: x => Math.round(x).toLocaleString("es-CO") + " USDT" });
    ["#c-ini", "#c-mes", "#c-anos"].forEach(id => App.$(id, el).addEventListener("input", () => { this.firma = null; this.pintar(); }));
    this.pintar();
  },
  pintar() {
    if (!this.montado) return;
    const $ = App.$, f = App.fmt, C = App.crecimiento;
    const ini = Math.max(0, +$("#c-ini").value || 0), mes = Math.max(0, +$("#c-mes").value || 0), anos = Math.min(20, Math.max(1, +$("#c-anos").value || 1));
    const firma = [ini, mes, anos].join("|");
    if (firma === this.firma) return;
    this.firma = firma;
    const n = anos * 12, base = Date.UTC(2027, 0, 1), t = i => base + i * 30.44 * 864e5;
    const p = C.proyectar(ini, mes, 0.08, n), e = C.proyectar(ini, mes, 0.13, n);
    if (this.g) this.g.poner([{ color: "#8b94a3", punteada: true, datos: p.map(x => [t(x.i), x.ap]) }, { color: "#3b6cf6", datos: p.map(x => [t(x.i), x.v]) }, { color: "#0f9d6a", area: true, datos: e.map(x => [t(x.i), x.v]) }]);
    const filas = [1, 3, 5, 10].filter(a => a <= anos).concat(anos > 10 || ![1, 3, 5, 10].includes(anos) ? [anos] : []);
    App.html($("#c-tabla"), [...new Set(filas)].map(a => { const i = a * 12; return `<tr><td>${a} año${a > 1 ? "s" : ""}</td><td class="num">${f.dinero(Math.round(p[i].ap))}</td><td class="num">${f.dinero(Math.round(p[i].v))}</td><td class="num up">${f.dinero(Math.round(e[i].v))}</td></tr>`; }).join(""));
    App.html($("#c-reparto"), mes ? `Con ${f.dinero(mes)} al mes: <b>${f.dinero(Math.round(mes * 0.6))}</b> al bot de trading y <b>${f.dinero(Math.round(mes * 0.4))}</b> a la bolsa de pánico.` : "");
  },
});
