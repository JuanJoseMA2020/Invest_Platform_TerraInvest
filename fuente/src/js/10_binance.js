/* Datos publicos de Binance (spot y futuros). No usa claves: solo lee precios. */
App.api = {
  offset: 0, ok: false, ultimo: 0, cache: new Map(),
  ahora() { return Date.now() + this.offset; },
  async get(base, ruta, params, ttl = 0) {
    const url = base + ruta + (params ? "?" + new URLSearchParams(params) : "");
    const c = this.cache.get(url);
    if (c && Date.now() - c.t < ttl) return c.v;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Binance " + r.status);
      const v = await r.json();
      this.cache.set(url, { t: Date.now(), v });
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
      this.ok = true; this.ultimo = Date.now();
      return v;
    } catch (e) { this.ok = Date.now() - this.ultimo < 30000; throw e; }
  },
  spot(ruta, params, ttl) { return this.get("https://api.binance.com", ruta, params, ttl); },
  fut(ruta, params, ttl) { return this.get("https://fapi.binance.com", ruta, params, ttl); },
  velas(simbolo, intervalo, limite = 300, ttl = 3000, extra) { return this.spot("/api/v3/klines", { symbol: simbolo, interval: intervalo, limit: limite, ...(extra || {}) }, ttl); },
  velasFut(simbolo, intervalo, limite = 300, ttl = 3000) { return this.fut("/fapi/v1/klines", { symbol: simbolo, interval: intervalo, limit: limite }, ttl); },
  cerradas(k) { const t = this.ahora(); return k.filter(x => +x[6] < t); },
  async sincronizar() { try { const j = await this.spot("/api/v3/time"); this.offset = j.serverTime - Date.now(); } catch (e) { /* se usa el reloj del equipo */ } },
  async enLotes(items, n, fn) {   // varias consultas a la vez sin saturar
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; try { out[j] = await fn(items[j]); } catch (e) { out[j] = null; } } }));
    return out;
  },
};
