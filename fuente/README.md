# Plataforma web (Trading · Señales · Futuros)

Una sola página (`dist/index.html`) con tres módulos independientes. No tiene servidor ni usa claves: lee datos públicos de
Binance desde el navegador. Funciona con doble clic y también publicada en GitHub Pages.

| Módulo | Qué hace | ¿Mueve dinero? |
|---|---|---|
| **Trading** | Radar del motor de tendencia del bot: qué monedas están en tendencia y a qué precio compraría o vendería. | No. El bot opera aparte, en el servidor; aquí solo se ve lo que él ve. |
| **Señales** | Avisa si BTC o ETH van a subir o bajar hasta el próximo cuarto de hora. La persona opera a mano en la cuenta demo de la plataforma y anota el resultado. | No. |
| **Futuros** | Simulador en papel de futuros de Binance (largo, corto, apalancamiento, liquidación), tasa de financiación en vivo y el resultado del estudio. | No. |

## Estructura

```
plataforma/
  construir.py            arma dist/index.html (junta todo en un archivo)
  probar.py               comprueba que la página calcula igual que el bot (Python contra JavaScript)
  modelo_senales.py       entrena el modelo de señales
  modelos/senales.json    modelo entrenado (lo genera construir.py)
  vendor/                 librería de gráficos (TradingView Lightweight Charts, Apache 2.0)
  src/
    index.html            esqueleto de la página
    css/app.css           estilos
    js/00_nucleo.js       navegación, guardado local, formato
    js/10_binance.js      datos públicos de Binance (spot y futuros)
    js/20_modelos.js      cálculos puros: señales y tendencia  <- probado contra Python
    js/30_grafico.js      gráficos de velas
    js/40_inicio.js       módulo Inicio
    js/41_trading.js      módulo Trading
    js/42_senales.js      módulo Señales
    js/43_futuros.js      módulo Futuros
    js/99_arranque.js     enciende todo
  dist/index.html         la página lista (esto es lo que se abre o se sube a GitHub Pages)
```

Cada módulo se registra con `App.registrar({id, titulo, montar, pintar})` y guarda sus datos con su propia clave en el
navegador. Agregar un módulo es agregar un archivo `js/4x_nombre.js`.

## Uso

```
python -m plataforma.construir            # entrena señales y arma la página
python -m plataforma.construir --rapido   # arma la página con el modelo ya entrenado
python -m plataforma.probar <carpeta con mini-racer>
```

Para refrescar los datos del modelo de señales antes de entrenar:
`python -m scripts.investigacion.descargar 5m --solo BTCUSDT,ETHUSDT,SOLUSDT,LINKUSDT,ADAUSDT` (borrando antes esos CSV).

## Reglas

- La página nunca envía órdenes ni pide claves.
- `js/20_modelos.js` no se cambia sin volver a correr `probar.py`: debe dar lo mismo que `bot/trend.py` y el estudio.
- Los datos de cada persona (marcador de señales, simulador) viven solo en su navegador.
