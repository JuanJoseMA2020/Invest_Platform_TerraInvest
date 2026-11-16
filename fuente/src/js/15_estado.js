/* Estado real de los bots: el servidor lo publica cada 15 minutos en la rama «estado» del repositorio (estado.json).
   Si no hay conexion, se usa la copia incluida al armar la pagina. Solo informacion de cuentas de practica. */
App.estado = {
  url: "https://raw.githubusercontent.com/JuanJoseMA2020/Invest_Platform_TerraInvest/estado/estado.json",
  d: DATOS.estado || null, ok: false, error: null, cargando: false,
  async cargar() {
    if (this.cargando) return; this.cargando = true;
    try {
      const r = await fetch(this.url + "?v=" + Math.floor(Date.now() / 120000), { cache: "no-store" });
      if (!r.ok) throw new Error("estado " + r.status);
      const d = await r.json();
      if (!this.d || (d.actualizado || 0) >= (this.d.actualizado || 0)) this.d = d;
      this.ok = true; this.error = null;
    } catch (e) { this.error = e.message; }
    this.cargando = false;
  },
  get fut() { return this.d && this.d.futuros && !this.d.futuros.error ? this.d.futuros : null; },
  get bot() { return this.d && this.d.bot && !this.d.bot.error ? this.d.bot : null; },
  get rend() { return (this.d && this.d.rendimientos) || DATOS.rendimientos || null; },
  edad() { return this.d ? Date.now() - this.d.actualizado : Infinity; },
  chip() {   // indicador de frescura de los datos del servidor
    if (!this.d) return '<span class="chip"><i></i>Sin datos del servidor</span>';
    const min = Math.round(this.edad() / 60000), viejo = min > 40;
    return `<span class="chip ${viejo ? "bad" : "ok"}" title="El servidor publica cada 15 minutos"><i></i>${viejo ? "Servidor sin reportar hace " + App.fmt.falta(this.edad()) : "Servidor al día · hace " + Math.max(min, 0) + " min"}</span>`;
  },
};
