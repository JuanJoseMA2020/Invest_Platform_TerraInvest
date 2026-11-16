# Plataforma TerraInvest

Dos piezas que trabajan juntas pero corren en lugares distintos:

1. **La página** (`src/` → `dist/index.html`): un solo archivo publicado en GitHub Pages. No tiene servidor ni claves de
   Binance: lee precios públicos desde el navegador y el estado que publica el servidor.
2. **El servidor de la plataforma** (`servidor/`): corre en AWS en `~/plataforma`, separado del bot de trading (`~/bot`).
   Cada 15 minutos: el bot de futuros revisa stops y, una vez al día, decide; después publica `estado.json`.

| Módulo de la página | Qué muestra | ¿Mueve dinero? |
|---|---|---|
| Inicio | Cómo van los dos bots frente a Bitcoin y lo último que hicieron. | No |
| Trading | Cuenta real (de práctica) del bot de trading y lo que ve en el mercado. | No: el bot opera en `~/bot` |
| Futuros | Bot de futuros (estado real), simulador manual y tasa de financiación. | No: el bot opera en `~/plataforma` |
| Rendimientos | Tasas del día para ganar intereses (DefiLlama, Binance) y calculadora. | No |
| Señales | Sube/baja a 15 minutos para practicar a mano en demo, con marcador. | No |
| Guía | Para qué sirve cada parte, glosario y preguntas frecuentes. | No |

## Estructura

```
construir.py            arma dist/index.html (todo en un archivo: funciona con doble clic y en GitHub Pages)
probar.py               comprueba que la página calcula igual que el bot (JavaScript contra Python)
modelo_senales.py       entrena el modelo de señales -> modelos/senales.json
vendor/                 librerías incluidas: gráficos (Lightweight Charts, Apache 2.0) y códigos QR (MIT)
src/index.html  src/css/app.css
src/js/00_nucleo.js     navegación, guardado local, formato, íconos
src/js/10_binance.js    datos públicos de Binance
src/js/15_estado.js     estado de los bots (rama «estado» del repositorio de la página)
src/js/16_ticker.js     barra de precios
src/js/17_nube.js       guardado en la nube: gist privado del dueño (marcador de señales y simulador, PC = celular)
src/js/20_modelos.js    cálculos puros (señales y tendencia)  <- probado contra Python
src/js/30_grafico.js    gráficos
src/js/40..45_*.js      un archivo por módulo
servidor/               bot de futuros + publicador (Python, corre en ~/plataforma con su propio .venv)
  ciclo.py              un ciclo completo (systemd lo llama cada 15 min); --probar, --reanudar
  estrategia.py         reglas de la estrategia (lógica pura)
  cuenta.py             Papel (simulado) y DemoCuenta (demo-fapi.binance.com). No existe modo real.
  binance.py almacen.py aviso.py publicar.py bot_spot.py rendimientos.py ajustes.py ajustes.yaml
despliegue/             desplegar.sh (servidor), publicar_pagina.sh (GitHub Pages), servicio y temporizador, Conectar futuros
```

## En el servidor (`~/plataforma`)

```
plataforma/servidor/    código (lo reemplaza cada despliegue)
.venv/                  entorno de Python propio
datos/futuros.db        base del bot de futuros   ·   datos/copias/  copia diaria (se guardan 7)
publicacion/            repositorio local de la rama «estado»
llaves.env              llaves de la cuenta demo y del Telegram de futuros (permisos 600; las escribe «Conectar futuros»)
~/.ssh/terra_estado     llave que solo puede escribir en el repositorio de la página
```

Comandos útiles (por SSH): `systemctl list-timers plataforma.timer` · `journalctl -u plataforma.service -n 30` ·
`cd ~/plataforma && .venv/bin/python -m plataforma.servidor.ciclo --probar`.

## Reglas

- La página nunca envía órdenes ni pide claves de Binance. La llave de GitHub para la nube solo tiene permiso de Gists y
  vive en cada dispositivo.
- El bot de futuros no tiene modo de dinero real. Sus límites (riesgo ≤ 1 %, frenos 3/6/30 %, apalancamiento ≤ 3x, stop
  en Binance) se comprueban en `ajustes.py` y no se pueden aflojar desde la configuración.
- `src/js/20_modelos.js` no se cambia sin volver a correr `probar.py`.
- El estado publicado es público: solo cuentas de práctica, nada de llaves, IPs ni errores con rutas.
