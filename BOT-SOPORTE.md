# Bot de soporte de DexCuba — puesta en marcha

Todo corre sobre Cloudflare: no hace falta servidor ni proceso aparte.

## 1. Crear el bot

En Telegram, habla con **@BotFather**:

```
/newbot
nombre:    Soporte DexCuba
usuario:   DexCubaSoporteBot     (debe acabar en "bot")
```

Te devuelve un **token** con esta forma: `8123456789:AAF...`. Guárdalo.

Opcional pero recomendable, en el mismo BotFather:

```
/setdescription   Soporte de DexCuba: dudas, estado de operaciones y disputas.
/setabouttext     Ayuda oficial de dexcuba.com
/setcommands
```

y pega la lista de comandos:

```
ayuda - Menú de temas
trade - Estado de una operación: /trade 5 [bsc]
tasa - Tasa cripto del día
soporte - Abrir un ticket con una persona
disputa - Reclamar una operación
cancelar - Salir de la conversación actual
```

## 2. Configurar los secretos en Cloudflare

```bash
cd ~/dexcuba

npx wrangler@latest pages secret put TELEGRAM_BOT_TOKEN --project-name dexcuba
# pega el token de BotFather

npx wrangler@latest pages secret put TELEGRAM_WEBHOOK_SECRET --project-name dexcuba
# inventa una cadena larga, p. ej.: dexcuba-webhook-9f3a7c21b5

npx wrangler@latest pages secret put TELEGRAM_ADMIN_CHAT --project-name dexcuba
# tu chat id (lo obtienes en el paso 4)
```

## 3. Desplegar

```bash
bash check.sh
npx wrangler@latest pages deploy . --project-name dexcuba --branch production --commit-dirty=true
```

## 4. Conectar el webhook

Sustituye `TOKEN` y `SECRETO` por los valores del paso 2:

```bash
curl -s "https://api.telegram.org/botTOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://dexcuba.com/api/telegram","secret_token":"SECRETO"}'
```

Debe responder `{"ok":true,...}`. Comprueba el estado cuando quieras:

```bash
curl -s "https://api.telegram.org/botTOKEN/getWebhookInfo"
```

Ahora abre tu bot en Telegram y escribe `/whoami`: te dirá tu **chat id**.
Guárdalo como `TELEGRAM_ADMIN_CHAT` (paso 2) y vuelve a desplegar para que
las alertas de tickets te lleguen.

## 5. Probar

| Escribe | Debe pasar |
|---|---|
| `/start` | Menú con todos los temas |
| `¿cuánto cobran de comisión?` | Responde el tema de comisiones sin comandos |
| `/trade 1` | Consulta el trade 1 en TRON, leído de la cadena |
| `/trade 1 bsc` | Lo mismo en BNB Chain |
| `/tasa` | Tasa cripto del día |
| `/soporte` | Tres preguntas y ticket creado |
| `/disputa` | Cuatro preguntas, ticket marcado como disputa |

Los tickets aparecen en **dexcuba.com/admin/soporte.html**, donde puedes
responder (el mensaje llega al usuario por Telegram) y cerrarlos.

## Notas de seguridad

- El webhook rechaza cualquier petición sin el secreto correcto.
- El bot **nunca** pide claves ni frases de recuperación, y si detecta que
  alguien está a punto de enviar una, lo frena y le avisa.
- El panel de tickets está bajo Cloudflare Access, como el resto de `/admin/`.

## Ampliar las respuestas

Todo el contenido informativo vive en `functions/lib/kb.js`. Para añadir un
tema: crea la entrada en `TEMAS` y añade su clave a `MENU`. No hace falta
tocar la lógica del bot.
