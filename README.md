# NFL Fantasy · Análisis

Página para analizar tu equipo de fantasy football de ESPN: alineación recomendada, proyecciones de la semana y del resto de la temporada, predicción de partidos, análisis de trades y movimientos sugeridos (waivers, comprar barato, vender caro).

## Cómo usarla

1. Abre la página.
2. En **Liga y datos**, arrastra el botón **⬇ Bajar mi liga de ESPN** a tu barra de favoritos.
3. Entra a tu liga en fantasy.espn.com y da clic en ese favorito. Se descarga `espn_liga.json`.
4. Regresa a la página y carga ese archivo. Tu roster, rivales y agentes libres salen de tu liga.

También puedes escribir tus jugadores a mano en **Mi equipo**.

Puedes **crear una cuenta** (correo y contraseña) en *Liga y datos*: tu roster, liga, seguimientos y trades se guardan en tu cuenta y se sincronizan en vivo entre tu computadora y tu teléfono. Sin cuenta, todo se queda en tu navegador. Cada cuenta solo puede ver sus propios datos.

Las cuentas viven en Supabase (tabla `nfl_estado`, con reglas RLS por usuario). La configuración está en `config_cuentas.js`; la librería está en `vendor/`.

## Datos

Las estadísticas vienen de [nflverse](https://github.com/nflverse) y de ESPN. Se actualizan solas los martes y sábados con GitHub Actions (`.github/workflows/actualizar.yml`), que corre `actualizar_datos.py` y guarda `data.js`.

La puntuación está configurada para una liga PPR de 10 equipos (ver `modelo.js`).
