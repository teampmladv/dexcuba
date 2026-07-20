# DexCuba — Wallet de pagos (demo)

Sitio estático + Pages Function lista para desplegar en **Cloudflare Pages**.

## Estructura

```
dexcuba/
├── index.html              → El wallet completo (HTML + CSS + JS)
├── swap.html               → DEX no-custodial (TronLink + router SunSwap)
├── p2p.html                → Tablero de intercambio P2P (no-custodial)
├── escrow.html             → Interfaz del contrato de escrow (TronLink)
├── contracts/
│   └── DexCubaEscrow.sol   → Contrato de escrow USDT (TRON / TRC-20)
├── wrangler.toml           → Config de despliegue + binding KV
├── functions/
│   └── api/
│       ├── prices.js       → Precios cripto en vivo (CoinGecko → Binance → caché)
│       ├── cup.js          → Tasa USD/CUP del mercado informal (elTOQUE)
│       └── offers.js       → Ofertas P2P (crear/listar/borrar) en Cloudflare KV
└── README.md
```

## Escrow con contrato inteligente (USDT/CUP)

`contracts/DexCubaEscrow.sol` bloquea el USDT mientras el CUP se paga fuera de
la cadena. Flujo: el vendedor deposita USDT → el comprador paga CUP y marca
"pagado" → el vendedor libera el USDT (o el árbitro resuelve una disputa). El
árbitro **solo puede enviar los fondos al comprador o al vendedor, nunca a sí
mismo**. `escrow.html` opera el contrato desde TronLink (crear, marcar pagado,
liberar, reembolsar, consultar estado).

### Desplegar el contrato — EMPIEZA EN TESTNET

Este contrato **no está auditado**. No lo pongas en mainnet con dinero real sin
antes: (1) probarlo en la testnet Nile con montos pequeños, y (2) encargar una
auditoría profesional.

Con TronBox (recomendado):

```bash
npm install -g tronbox
mkdir escrow && cd escrow && tronbox init
# copia DexCubaEscrow.sol dentro de contracts/
# configura la red Nile y tu clave privada de prueba en tronbox-config.js
tronbox compile
tronbox migrate --network nile
```

El constructor recibe tres parámetros: la dirección del token USDT (en Nile un
USDT de prueba; en mainnet el USDT-TRC20 verificado), la dirección que cobrará
la comisión (`feeCollector`, tu wallet) y `feeBps` (comisión en puntos básicos:
**50 = 0,5 %**, con tope máximo de 100 = 1 %). Alternativa rápida sin instalar
nada: pega el `.sol` en el IDE web de TRON (tronide) y despliega con TronLink en
Nile.

### Comisión (modelo de ingresos)

La plataforma cobra `feeBps` (0,5 % por defecto) **descontado del USDT y solo al
liberar** una operación exitosa; en los reembolsos no se cobra nada. Al liberar,
el contrato envía `monto − comisión` al comprador y la comisión a `feeCollector`.
El árbitro sigue sin poder quedarse fondos: el USDT solo va al comprador (menos
comisión) o al vendedor. Si cambias `feeBps`, actualiza también la constante
`FEE_BPS` en `escrow.html` para que la vista previa coincida.

### Conectar la interfaz

Tras desplegar, copia la dirección del contrato en `ESCROW_ADDRESS` dentro de
`escrow.html` (y confirma `USDT_ADDRESS`). Mientras `ESCROW_ADDRESS` esté vacío,
la interfaz muestra un aviso y deshabilita las acciones por seguridad.

### Nota legal

Actuar como árbitro (tener una llave que puede mover fondos entre las partes) es
el punto más sensible en términos regulatorios, aunque el árbitro no pueda
quedarse los fondos. Para reducir exposición, considera un árbitro neutral o un
multisig en vez de una sola llave tuya. Esto no es asesoría legal.

## DEX — Swap cripto-a-cripto (swap.html)

Intercambio **cripto-a-cripto, on-chain y no-custodial** sobre TRON. La página
conecta la billetera del usuario (**TronLink**) y llama directamente al router
de **SunSwap** (el AMM líder de TRON, estilo Uniswap V2). DexCuba no toca fondos
ni tiene backend en este flujo: todo lo firma el usuario desde su wallet, contra
un contrato permisionless. Al no haber fiat ni custodia, la exposición a
licencias es mínima (no es asesoría legal).

### Antes de operar en mainnet — IMPORTANTE

En `swap.html`, sección CONFIGURACIÓN, debes rellenar y **verificar en TronScan**:
- `ROUTER_ADDRESS` → router de SunSwap (dirección oficial verificada).
- `WTRX_ADDRESS` → TRX envuelto (solo si permites pares con TRX nativo).
- Los contratos de cada token en `TOKENS` (USDT-TRC20 viene precargado; verifícalo).

Mientras `ROUTER_ADDRESS` esté vacío, el swap se muestra deshabilitado a
propósito. **Prueba primero en la testnet Nile con montos pequeños.** Un error en
una dirección de contrato cuesta fondos reales: este es el único punto que no se
debe apurar.

### Pares

- Nativos de TRON (USDT/TRX, USDT/USDC, USDT/USDD…) → swap directo, listo.
- BTC nativo no vive en TRON: requiere BTC envuelto (TRC-20) o un puente
  cross-chain (Symbiosis/deBridge) — fase 2, con más complejidad y riesgo.

## Mercado P2P (no-custodial)

`/p2p.html` es un tablero donde los usuarios publican ofertas de compra/venta de
USDT y BTC por CUP y se contactan directo (Telegram/WhatsApp) para liquidar
**billetera a billetera**. DexCuba **no toca fondos, no custodia, no interviene
en el pago** — por eso su exposición regulatoria es mínima. Aun así, mover
dinero de terceros toca leyes de transmisión de dinero y sanciones (los pares
tocan USD): consulta a un abogado antes de escalar. Esto no es asesoría legal.

Las ofertas se guardan en **Cloudflare KV** y caducan solas a los 7 días.

### Configurar el almacenamiento KV (una vez)

```bash
cd dexcuba
npx wrangler kv namespace create OFFERS
```

Copia el `id` que te devuelve y pégalo en `wrangler.toml` (reemplaza
`PON_AQUI_EL_ID`). Luego redespliega. Alternativa por panel: Workers & Pages →
dexcuba → Settings → Functions → KV namespace bindings → variable `OFFERS`.

Sin este binding, el tablero muestra un aviso claro en vez de romperse.

## Tasa del peso cubano (elTOQUE)

`/api/cup` consulta la Tasa Representativa del Mercado Informal (TRMI) de
**elTOQUE**. Necesita una clave gratuita:

1. Solicítala en https://tasas-token.eltoque.com/ (describe tu app y acepta
   los términos). Te la envían por correo.
2. Guárdala como secreto en tu proyecto:

   ```bash
   npx wrangler pages secret put ELTOQUE_TOKEN --project-name dexcuba
   # pega la clave cuando la pida
   ```

3. Si el correo de alta indica una URL o formato de endpoint distinto al que
   trae `cup.js` por defecto, ajústalo sin tocar código con otro secreto:

   ```bash
   npx wrangler pages secret put ELTOQUE_URL --project-name dexcuba
   ```

Condiciones de elTOQUE que este proyecto ya respeta: se muestra el crédito a
elTOQUE como fuente en el pie del sitio, la tasa se cachea 6 h para no agotar
la cuota (5000 req/mes en beta) y se trata siempre como valor de referencia,
no como precio de transacción. **No compartas tu clave.**

La carpeta `functions/` es especial: Cloudflare la detecta automáticamente y
convierte cada archivo en un endpoint. `functions/api/prices.js` se sirve en
`/api/prices` y el frontend lo consume solo — sin configurar nada extra.
Los precios vienen de CoinGecko con caché de 60 segundos en el edge. Si la
función no está disponible (por ejemplo, abriendo el HTML localmente), el
sitio funciona igual con datos de demostración.

## Opción A — Desplegar desde el panel (sin instalar nada)

1. Entra a https://dash.cloudflare.com → **Workers & Pages** → **Create** → pestaña **Pages**.
2. Elige **Upload assets** (subida directa).
3. Nombre del proyecto: `dexcuba` → arrastra la carpeta completa `dexcuba/`.
4. Pulsa **Deploy**. En segundos tendrás `https://dexcuba.pages.dev`.

⚠️ Con subida directa las Pages Functions **no** se despliegan. Si quieres el
endpoint de precios en vivo, usa la opción B o C.

## Opción B — Desplegar con Wrangler (CLI, incluye la función)

Requiere Node.js 18+.

```bash
cd dexcuba
npx wrangler login
npx wrangler pages deploy . --project-name dexcuba
```

Wrangler detecta `functions/` automáticamente y publica todo junto.
Para probar en local antes de subir:

```bash
npx wrangler pages dev .
# abre http://localhost:8788 — /api/prices ya funciona
```

## Opción C — Conectar un repositorio Git (recomendado para iterar)

1. Sube la carpeta a un repo de GitHub.
2. En **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Selecciona el repo. Build command: *(vacío)*. Output directory: `/`.
4. Cada `git push` desplegará automáticamente, con vista previa por rama.

## Conectar tu dominio dexcuba.com

1. Asegúrate de que el dominio esté gestionado en tu cuenta de Cloudflare
   (DNS). Si lo compraste en otro registrador, apunta los nameservers a
   Cloudflare primero.
2. En tu proyecto de Pages → **Custom domains** → **Set up a custom domain**.
3. Escribe `dexcuba.com` (y opcionalmente `www.dexcuba.com`). Cloudflare crea
   los registros DNS y el certificado SSL automáticamente.

## Importante

Esto es una **demo de interfaz**: los saldos y envíos son simulados en el
navegador. Para procesar pagos reales necesitarías un backend con
autenticación de usuarios, custodia de claves (o integración con wallets
no-custodiales), verificación de transacciones on-chain y cumplimiento
legal/regulatorio según las jurisdicciones donde operes.

## Personalización rápida

- **Colores**: edita las variables en `:root` dentro de `index.html`
  (`--accent`, `--bg`, `--panel`…).
- **Monedas**: edita el arreglo `ASSETS` (y la constante `COINS` en
  `functions/api/prices.js` usando los ids de CoinGecko).
- **Tasa CUP de referencia**: constante `CUP_RATE` en `index.html`.
