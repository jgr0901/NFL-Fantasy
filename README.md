# NFL Fantasy · Análisis

Página para analizar tu equipo de fantasy football de ESPN: alineación recomendada, proyecciones de la semana y del resto de la temporada, predicción de partidos, análisis de trades y movimientos sugeridos (waivers, comprar barato, vender caro).

## Cómo usarla

1. Abre la página. Siempre abre en **Mi equipo**, con el resumen de **Esta semana**: qué cambiar en tu alineación de ESPN, la mejor adición de waivers y una idea de trade.
2. La primera vez, en **Liga**, arrastra el botón **⬇ Bajar mi liga de ESPN** a tu barra de favoritos, entra a tu liga en fantasy.espn.com y da clic en ese favorito. Así la página aprende tu liga.
3. Desde ahí, tu liga se pone al día con **⟳ Actualizar**. El favorito solo vuelve a hacer falta si ESPN no deja leer tu liga desde la página (liga privada en iPhone o Safari).

Sin liga conectada puedes escribir tus jugadores a mano en **Mi equipo**. Con la liga conectada, el roster siempre es el de ESPN.

### Botón ⟳ Actualizar

Arriba, junto al nombre. Vuelve a leer tu liga de ESPN directo (si ESPN lo permite: ligas públicas, o Chrome en computadora con tu sesión de ESPN) y trae el `data.js` más nuevo publicado. Si guardas una llave de GitHub (fine-grained, solo *Actions: Read and write* en este repositorio) en **Liga y datos**, el botón además corre `actualizar.yml` en ese momento y espera a que se publiquen los datos. La llave solo se guarda en ese navegador.

Puedes **crear una cuenta** (correo y contraseña) en *Liga y datos*: tu roster, liga, seguimientos y trades se guardan en tu cuenta y se sincronizan en vivo entre tu computadora y tu teléfono. Sin cuenta, todo se queda en tu navegador. Cada cuenta solo puede ver sus propios datos.

Las cuentas viven en Supabase (tabla `nfl_estado`, con reglas RLS por usuario). La configuración está en `config_cuentas.js`; la librería está en `vendor/`.

## Datos

Las estadísticas vienen de [nflverse](https://github.com/nflverse) y de ESPN. Se actualizan solas cada mañana y el domingo antes de los partidos con GitHub Actions (`.github/workflows/actualizar.yml`), que corre `actualizar_datos.py` (guarda `data.js`) y `generar_historial.js` (guarda `historial.js`).

## Precisión y ajuste automático

`generar_historial.js` vuelve a correr el modelo semana por semana con los datos que había antes de cada una y compara contra lo que pasó. Con eso:

- prueba otras combinaciones de parámetros (peso de semanas recientes, regresión de TDs, peso de las casas de apuestas, variación de un partido, peso de ESPN) y guarda en `historial.js` las que se equivocan al menos 1% menos; `modelo.js` las usa al cargar;
- ajusta el ancho del rango de cada jugador para que de verdad cubra 8 de cada 10 semanas (antes cubría cerca de 4);
- la pestaña **Partidos → Qué tan bien predice** muestra el error, si los porcentajes de ganar son confiables y qué cambió el ajuste.

La página también guarda tu alineación de cada semana (en tu cuenta) para mostrar en **Mi equipo → Tus decisiones** cuántos puntos dejaste en la banca, y sigue los trades que marcas como hechos.

La puntuación y la alineación salen de tu liga de ESPN; sin liga se usa una PPR de 10 equipos (ver `modelo.js`).
