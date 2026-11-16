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

/* Curvas de patrimonio y comparativas: series [{color, datos: [[ms, valor]], area}] */
App.lineas = (el, opciones) => {
  if (!window.LightweightCharts) { el.innerHTML = '<div class="empty">Gráfico no disponible.</div>'; return null; }
  const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim(), o = opciones || {};
  const chart = LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: v("--mute"), fontFamily: v("--font"), fontSize: 11.5, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,.04)" } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } }, timeScale: { borderVisible: false, timeVisible: !!o.horas },
    crosshair: { mode: 0 }, localization: { locale: "es-CO", priceFormatter: o.formato || (x => x.toLocaleString("es-CO", { maximumFractionDigits: 2 })) },
    handleScroll: false, handleScale: false,
  });
  let series = [];
  const local = ms => Math.floor(ms / 1000) - new Date().getTimezoneOffset() * 60;
  return {
    poner(lista) {
      series.forEach(s => chart.removeSeries(s));
      series = lista.filter(s => s.datos && s.datos.length).map(s => {
        const serie = s.area ? chart.addAreaSeries({ lineColor: s.color, topColor: s.color + "55", bottomColor: s.color + "00", lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
                             : chart.addLineSeries({ color: s.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, lineStyle: s.punteada ? 2 : 0 });
        const vistos = new Map(); s.datos.forEach(([t, y]) => { if (isFinite(y)) vistos.set(local(t), y); });
        serie.setData([...vistos].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })));
        if (s.base != null) serie.createPriceLine({ price: s.base, color: "rgba(255,255,255,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        return serie;
      });
      chart.timeScale().fitContent();
    },
  };
};

App.spark = (el, datos, color) => {   // linea minima sin ejes
  if (!window.LightweightCharts || !datos || datos.length < 2) return;
  if (el.__spark) { el.__spark.setData(datos); return; }
  const c = LightweightCharts.createChart(el, { autoSize: true, layout: { background: { color: "transparent" }, textColor: "transparent", attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, leftPriceScale: { visible: false }, timeScale: { visible: false },
    handleScroll: false, handleScale: false, crosshair: { vertLine: { visible: false }, horzLine: { visible: false } } });
  el.__spark = c.addAreaSeries({ lineColor: color, topColor: color + "40", bottomColor: color + "00", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  el.__spark.setData(datos); c.timeScale().fitContent();
};
App.sparkDatos = pares => { const m = new Map(); pares.forEach(([t, y]) => { if (isFinite(y)) m.set(Math.floor(t / 1000), y); }); return [...m].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })); };
