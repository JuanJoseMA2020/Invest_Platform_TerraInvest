/* Barra superior: precios en vivo y hora de Colombia y UTC. */
App.ticker = {
  syms: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ZECUSDT", "SUIUSDT"], p: {},
  async tick() {
    const d = await App.api.spot("/api/v3/ticker/24hr", { symbols: JSON.stringify(this.syms) }, 8000);
    d.forEach(x => { this.p[x.symbol] = { precio: +x.lastPrice, cambio: +x.priceChangePercent / 100 }; });
    this.pintar();
  },
  pintar() {
    const f = App.fmt;
    App.html(document.getElementById("ticker"), this.syms.filter(s => this.p[s]).map(s => {
      const x = this.p[s];
      return `<span class="tk"><b>${s.slice(0, -4)}</b><span class="num">${f.precio(x.precio)}</span><span class="num ${x.cambio >= 0 ? "up" : "down"}">${f.pct(x.cambio, 2)}</span></span>`;
    }).join(""));
  },
  reloj() {
    const t = new Date(App.api.ahora());
    App.texto(document.getElementById("reloj"), `${t.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${t.toISOString().slice(11, 16)} UTC`);
  },
};
