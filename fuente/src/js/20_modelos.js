/* Modelos: calculo puro (sin pantalla ni red). Deben dar EXACTAMENTE lo mismo que el codigo Python del bot y del estudio;
   plataforma/probar.py lo comprueba con un motor de JavaScript. No cambiar sin volver a correr esa prueba. */
/*MODELO-INICIO*/
function std(a){const n=a.length;let m=0;for(const x of a)m+=x;m/=n;let s=0;for(const x of a)s+=(x-m)*(x-m);return Math.sqrt(s/(n-1));}
function mean(a){let m=0;for(const x of a)m+=x;return m/a.length;}

/* ---- Señales a minutos (scripts/investigacion/binarias.py). k: velas cerradas [aperturaMs, apertura, max, min, cierre, volumen] */
function variables(k){
  const n=k.length,i=n-1; if(n<125) return null;
  const c=k.map(x=>+x[4]),h=k.map(x=>+x[2]),lo=k.map(x=>+x[3]),o=k.map(x=>+x[1]),v=k.map(x=>+x[5]);
  const r=[NaN]; for(let j=1;j<n;j++) r.push(Math.log(c[j]/c[j-1]));
  const f={};
  for(const m of [1,2,3,5,10,20,60]) f["ret"+m]=Math.log(c[i]/c[i-m]);
  const vol=std(r.slice(i-59,i+1));
  for(const m of [1,5,20]) f["z"+m]=f["ret"+m]/(vol*Math.sqrt(m));
  f.vol_ratio=std(r.slice(i-9,i+1))/vol;
  const w=r.slice(i-13,i+1),up=mean(w.map(x=>Math.max(x,0))),dn=mean(w.map(x=>Math.max(-x,0)));
  f.rsi=up/(up+dn);
  for(const m of [20,60]){const hi=Math.max(...h.slice(i-m+1,i+1)),lw=Math.min(...lo.slice(i-m+1,i+1));f["pos"+m]=(c[i]-lw)/(hi-lw);}
  const rng=h[i]-lo[i];
  f.body=(c[i]-o[i])/rng; f.wick_up=(h[i]-Math.max(c[i],o[i]))/rng; f.wick_dn=(Math.min(c[i],o[i])-lo[i])/rng;
  const vw=v.slice(i-59,i+1); f.vol_z=(v[i]-mean(vw))/std(vw);
  const s=Math.sign(r[i]); let run=0; for(let j=i-1;j>=1&&Math.sign(r[j])===s;j--) run++;
  f.racha=run*s;
  const d=new Date(+k[i][0]),hour=d.getUTCHours()+d.getUTCMinutes()/60;
  f.h_sin=Math.sin(2*Math.PI*hour/24); f.h_cos=Math.cos(2*Math.PI*hour/24);
  for(const key in f) if(!isFinite(f[key])) return null;
  return f;
}
function probabilidad(a,k){ // probabilidad de que SUBA en el horizonte del modelo
  const f=variables(k); if(!f) return null;
  let z=a.intercepto; a.cols.forEach((col,j)=>{z+=a.coef[j]*(f[col]-a.media[j])/a.escala[j];});
  return 1/(1+Math.exp(-z));
}

/* ---- Tendencia por canales (bot/trend.py). k: velas cerradas de 4 h. bpd = velas por dia. */
function canal(k,diasIn,diasOut,bpd){
  const n=k.length,wi=diasIn*bpd,wo=diasOut*bpd,h=k.map(x=>+x[2]),lo=k.map(x=>+x[3]),c=k.map(x=>+x[4]);
  if(n<=wi) return null;
  let estado=0,hi=NaN,lw=NaN;
  for(let i=wo;i<n;i++){
    lw=Infinity; for(let j=i-wo;j<i;j++) if(lo[j]<lw) lw=lo[j];
    hi=NaN; if(i>=wi){hi=-Infinity; for(let j=i-wi;j<i;j++) if(h[j]>hi) hi=h[j];}
    if(c[i]>hi) estado=1; else if(c[i]<lw) estado=-1;
  }
  return {largo:estado===1,corto:null,hi,lo:lw,cierre:c[n-1]};
}
function canalCorto(k,diasIn,diasOut,bpd){ // espejo para futuros: entra al perder el minimo de diasIn, sale al superar el maximo de diasOut
  const n=k.length,wi=diasIn*bpd,wo=diasOut*bpd,h=k.map(x=>+x[2]),lo=k.map(x=>+x[3]),c=k.map(x=>+x[4]);
  if(n<=wi) return null;
  let estado=0,hi=NaN,lw=NaN;
  for(let i=wo;i<n;i++){
    hi=-Infinity; for(let j=i-wo;j<i;j++) if(h[j]>hi) hi=h[j];
    lw=NaN; if(i>=wi){lw=Infinity; for(let j=i-wi;j<i;j++) if(lo[j]<lw) lw=lo[j];}
    if(c[i]<lw) estado=1; else if(c[i]>hi) estado=-1;
  }
  return {corto:estado===1,hi,lo:lw,cierre:c[n-1]};
}
function filtroBtc(k,dias,bpd){ // Bitcoin sobre su media de `dias` dias
  const w=dias*bpd,c=k.map(x=>+x[4]); if(c.length<w) return null;
  const m=mean(c.slice(c.length-w)); return {sano:c[c.length-1]>m,dist:c[c.length-1]/m-1,media:m};
}
function atrDiario(k,bpd){ // ATR(14) de Wilder en velas de 4 h, llevado a un dia (como bot/signals.py)
  const n=k.length; if(n<16) return null;
  let a=null,s=0;
  for(let i=1;i<n;i++){
    const tr=Math.max(+k[i][2]-+k[i][3],Math.abs(+k[i][2]-+k[i-1][4]),Math.abs(+k[i][3]-+k[i-1][4]));
    if(i<=14){s+=tr; if(i===14) a=s/14;} else a=(a*13+tr)/14;
  }
  return a*Math.sqrt(bpd);
}
function elegirUniverso(vol,inicioMes,n,ventana,minHist){ // vol: {simbolo: [[ms, volumenUSDT]...]} diario
  const r=[];
  for(const s in vol){
    const past=vol[s].filter(x=>x[0]<inicioMes);
    if(past.length<minHist||past[past.length-1][0]<inicioMes-3*86400000) continue;
    r.push([mean(past.slice(-ventana).map(x=>x[1])),s]);
  }
  return r.sort((a,b)=>b[0]-a[0]).slice(0,n).map(x=>x[1]);
}
/*MODELO-FIN*/
App.modelo = { variables, probabilidad, canal, canalCorto, filtroBtc, atrDiario, elegirUniverso };
