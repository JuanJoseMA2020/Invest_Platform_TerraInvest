/* Grafico de velas (TradingView Lightweight Charts, incluido en la pagina). */
App.grafico = el => {
  if (!window.LightweightCharts) { el.innerHTML = '<div class="empty">Gráfico no disponible.</div>'; return null; }
  const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
  const chart = LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: v("--mute"), fontFamily: v("--font"), fontSize: 12 },
    grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.035)" } },
    rightPriceScale: { borderColor: v("--line") }, timeScale: { borderColor: v("--line"), timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 }, localization: { locale: "es-CO" },
  });
  const velas = chart.addCandlestickSeries({ upColor: v("--up"), downColor: v("--down"), wickUpColor: v("--up"), wickDownColor: v("--down"), borderVisible: false });
  let lineas = [], clave = "";
  const local = ms => Math.floor(ms / 1000) - new Date().getTimezoneOffset() * 60;   // el grafico muestra hora local
  return {
    velas(k, id) {
      velas.setData(k.map(x => ({ time: local(+x[0]), open: +x[1], high: +x[2], low: +x[3], close: +x[4] })));
      if (id !== clave) { clave = id; chart.timeScale().fitContent(); }
    },
    niveles(lista) {   // [{precio, titulo, color}]
      lineas.forEach(l => velas.removePriceLine(l));
      lineas = lista.filter(l => isFinite(l.precio)).map(l => velas.createPriceLine({ price: l.precio, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.titulo }));
    },
    marcas(lista) {    // [{t (ms), sube (bool), texto}]
      velas.setMarkers(lista.sort((a, b) => a.t - b.t).map(m => ({ time: local(m.t), position: m.sube ? "belowBar" : "aboveBar", shape: m.sube ? "arrowUp" : "arrowDown", color: m.sube ? v("--up") : v("--down"), text: m.texto || "" })));
    },
  };
};
