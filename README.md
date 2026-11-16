# TerraInvest · Plataforma de inversión

Una sola página con tres módulos independientes:

| Módulo | Qué hace |
|---|---|
| **Trading** | Radar del motor de tendencia: qué monedas están en tendencia y a qué precio se compraría o vendería. |
| **Señales** | Avisa si BTC o ETH van a subir o bajar hasta el próximo cuarto de hora, con marcador de aciertos. |
| **Futuros** | Bot automático de futuros (cuenta de práctica) con su estado real, simulador manual y tasa de financiación en vivo. |
| **Rendimientos** | Formas de ganar intereses con el dinero quieto: tasas en vivo, riesgo explicado y calculadora. |

La página no envía órdenes, no pide claves y no mueve dinero. El estado de los bots lo publica el servidor en la rama `estado` (solo cuentas de práctica). Solo lee datos públicos de Binance desde el navegador;
el marcador y el simulador se guardan en el navegador de cada persona.

- `index.html`: la página lista (la que publica GitHub Pages).
- `fuente/`: el código separado por módulos (`src/css`, `src/js`) y los programas que arman la página.

Esto es una herramienta de estudio y práctica, no una recomendación de inversión.
