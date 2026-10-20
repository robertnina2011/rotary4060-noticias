# Noticias del Distrito 4060 (Rotary · Rotaract · Interact)

Cada mañana (7:00, hora de República Dominicana) GitHub Actions ejecuta `scripts/noticias.mjs`:

- busca en Google Noticias la prensa dominicana sobre los clubes del distrito y lee las entradas de rotary4060.org;
- guarda las más recientes en `data/noticias.json` y **todas** en `data/archivo-noticias.json` (nunca se borra nada);
- si hay tokens de Instagram en los *secrets* del repositorio, guarda las últimas publicaciones en `data/instagram.json`.

La web del distrito lee estos archivos desde `raw.githubusercontent.com`.

**Instagram:** cada cuenta debe ser profesional y generar un token de la API de Instagram. Se guardan en
*Settings → Secrets and variables → Actions* con estos nombres: `IG_TOKEN_ROTARYDISTRITO4060`, `IG_TOKEN_INTERACT4060`,
`IG_TOKEN_CLUBROTARACTSANCRISTOBAL`.

Para lanzarlo a mano: pestaña **Actions → Noticias diarias → Run workflow**.
