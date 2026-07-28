// DexCuba — base de conocimiento del bot de soporte (Telegram)
// ---------------------------------------------------------------------------
// Todo el contenido informativo vive aquí para poder ampliarlo sin tocar la
// lógica del bot. Cada tema tiene: título, texto y (opcional) subtemas.
// El texto usa HTML de Telegram: <b>, <i>, <code>, <a href="">.

export const CONTACTO_HUMANO =
  'Si tu caso necesita revisión humana, escribe /soporte y te abrimos un ticket.';

export const TEMAS = {
  /* ====================== EMPEZAR ====================== */
  inicio: {
    titulo: '¿Qué es DexCuba?',
    texto:
`<b>DexCuba</b> es una plataforma cubana para comprar, vender y cobrar en USDT.

<b>Lo que la hace distinta:</b>
• <b>Sin custodia</b>: tu dinero nunca pasa por nosotros. Va de tu wallet a la de la otra persona, o queda bloqueado en un contrato inteligente que ni nosotros podemos vaciar.
• <b>Sin KYC ni documentos</b>: tu cuenta es tu wallet. No pedimos carnet, ni selfies, ni datos bancarios.
• <b>Sin contraseñas</b>: entras firmando un mensaje con tu wallet. La firma es gratis y no autoriza ningún pago.

<b>Qué puedes hacer:</b>
• Mercado P2P: comprar o vender USDT por CUP con otras personas
• Escrow: proteger esas operaciones con un contrato que retiene el USDT hasta que ambas partes cumplan
• Cobros: generar un enlace o un QR para que te paguen en USDT
• Mostrador (POS): cobrar en persona tecleando el importe en CUP
• Convertidor: cambiar entre criptomonedas dentro de BNB Chain`,
  },

  primeros_pasos: {
    titulo: 'Primeros pasos',
    texto:
`<b>1. Instala una wallet</b>
Para TRON (TRC-20): TronLink o Trust Wallet.
Para BNB Chain (BEP-20): MetaMask, Trust, Bitget u OKX.
La wallet es tuya: DexCuba no puede tocarla ni recuperarla si pierdes tu frase de 12 palabras.

<b>2. Guarda tu frase de recuperación</b>
Escríbela en papel. Nadie de DexCuba te la pedirá jamás. Quien te la pida, te está robando.

<b>3. Abre dexcuba.com desde el navegador de tu wallet</b>
En el móvil, las wallets solo funcionan desde su navegador interno: abre la app → Descubrir/Navegador → escribe <code>dexcuba.com</code>.

<b>4. Conecta y entra</b>
Pulsa "Conectar wallet", elige la red (TRON o BNB Chain) y firma el mensaje. Ya tienes cuenta.

<b>5. Antes de operar</b>
Necesitas un poco de moneda de red para las comisiones: TRX en TRON, BNB en BNB Chain. Sin eso no puedes firmar nada.`,
  },

  /* ====================== REDES ====================== */
  redes: {
    titulo: 'TRC-20 y BEP-20: cuál elegir',
    texto:
`El mismo USDT existe en varias redes, y <b>no se mezclan</b>: si envías USDT TRC-20 a una dirección BEP-20, se pierde.

<b>TRC-20 (TRON)</b> — direcciones que empiezan por <code>T</code>
• La más usada en Cuba
• Comisiones bajas, pero necesitas TRX
• Las cuentas nuevas <b>no existen</b> hasta recibir su primer TRX

<b>BEP-20 (BNB Chain)</b> — direcciones que empiezan por <code>0x</code>
• Comisiones más baratas todavía
• Necesitas BNB para las comisiones
• Ideal para cantidades pequeñas

<b>Regla de oro:</b> antes de enviar, comprueba que la dirección y la red coinciden. Una dirección <code>T…</code> solo recibe TRC-20; una <code>0x…</code> solo BEP-20.`,
  },

  /* ====================== ESCROW ====================== */
  escrow: {
    titulo: 'Cómo funciona el escrow',
    texto:
`El escrow es un <b>contrato inteligente</b> que retiene el USDT mientras se completa el pago en CUP. Ni DexCuba ni nadie puede sacar ese dinero fuera del trato.

<b>Los cuatro pasos:</b>
1️⃣ <b>Bloquear</b> — el vendedor deposita el USDT en el contrato
2️⃣ <b>Pagar CUP</b> — el comprador envía los pesos por fuera (Transfermóvil, efectivo…) y marca "CUP pagado"
3️⃣ <b>Liberar</b> — el vendedor confirma que recibió y el USDT viaja al comprador
4️⃣ <b>Disputa</b> (solo si algo falla) — un árbitro decide a quién van los fondos

<b>Garantías del contrato:</b>
• Los fondos <b>solo</b> pueden salir hacia el comprador o el vendedor. Nunca hacia el árbitro ni hacia DexCuba.
• Máximo <b>200 USDT por operación</b> (límite de seguridad mientras no haya auditoría formal)
• Si el comprador nunca marca el pago, el vendedor recupera su dinero pasado el plazo de seguridad
• El código es público y verificado: cualquiera puede leerlo

<b>Comisión: 0,5%</b>, y solo se cobra cuando se libera. En los reembolsos no se cobra nada.`,
  },

  escrow_ids: {
    titulo: 'El número de trade (ID)',
    texto:
`Cada operación de escrow recibe un <b>número</b> al crearse. Con él se consulta el estado y se ejecutan los pasos.

<b>Si eres el vendedor:</b> el número aparece al bloquear el USDT, junto a un enlace listo para enviar al comprador por WhatsApp o Telegram.

<b>Si eres el comprador:</b> abre el enlace que te enviaron y el número queda puesto solo.

<b>¿Perdiste el número?</b> Escríbeme <code>/trade NÚMERO</code> y te digo el estado. Si tampoco recuerdas el número, mira en tu wallet el historial de transacciones con el contrato, o pídeselo a la otra parte.

<b>Consulta rápida aquí mismo:</b>
<code>/trade 5</code> — busca el trade 5 en TRON
<code>/trade 5 bsc</code> — busca el trade 5 en BNB Chain`,
  },

  disputa_info: {
    titulo: 'Disputas: cómo funcionan',
    texto:
`Una disputa ocurre cuando comprador y vendedor no se ponen de acuerdo: normalmente <i>"yo pagué los CUP"</i> contra <i>"a mí no me llegó nada"</i>.

<b>Quién decide:</b> el árbitro designado en ese trade — en las operaciones de DexCuba, una wallet de hardware bajo control de la plataforma. El contrato le permite <b>solo</b> dos cosas: enviar los fondos al comprador o devolvérselos al vendedor. No puede quedárselos.

<b>Qué necesitamos para resolver:</b>
• Número del trade y red
• Comprobante del pago en CUP: <b>número de transacción</b> del banco o de Transfermóvil, importe y hora exacta
• Tu versión de lo ocurrido

<b>Cómo abrir una disputa:</b> escribe /disputa y te guío paso a paso.

<b>Consejo que evita el 90% de los conflictos:</b> guarda siempre el número de transacción de tu pago en CUP. Una captura se falsifica; un número lo comprueba el otro en su banco en dos minutos.`,
  },

  /* ====================== COBROS ====================== */
  cobros: {
    titulo: 'Enlaces de cobro',
    texto:
`Sirven para pedir una cantidad exacta de USDT a cualquiera.

<b>Cómo funciona:</b>
1. Entra en dexcuba.com → <b>Cobrar</b>
2. Pon tu wallet, la red, el importe y el concepto
3. Comparte el enlace por WhatsApp o Telegram

Quien lo abre ve tu alias, el importe, su equivalencia en CUP y un QR. Paga desde su wallet y el USDT llega <b>directo a la tuya</b>: DexCuba no toca nada y <b>no cobra comisión</b> por esto.

<b>El pago se verifica en la cadena</b>: cuando llega, el enlace pasa a "PAGADO ✓" automáticamente, aunque hayan pagado a mano sin usar el botón.

<b>Límites:</b> 3 enlaces activos en el plan gratuito, ilimitados con VIP. Caducan a los 30 días.`,
  },

  mostrador: {
    titulo: 'Modo mostrador (POS)',
    texto:
`Para cobrar <b>en persona</b>, como una caja registradora.

<b>Cómo se usa:</b>
1. dexcuba.com → Cobrar → <b>Modo mostrador</b>
2. Configura una vez: nombre del negocio, tu wallet y la red
3. Teclea el importe — <b>puedes teclearlo en CUP</b> y se convierte solo con la tasa del día
4. Pulsa COBRAR y aparece un QR grande
5. El cliente lo escanea con la cámara y paga

Cuando el pago llega, la pantalla se pone verde con "PAGADO", el teléfono vibra y queda listo para el siguiente cliente. La detección es automática: revisamos la cadena cada pocos segundos.

<b>Límites diarios:</b> 10 cobros gratis · 30 con VIP · <b>sin límite con Business</b>.`,
  },

  /* ====================== CONVERTIDOR ====================== */
  convertidor: {
    titulo: 'Convertidor de criptomonedas',
    texto:
`Cambia entre las cripto más usadas de BNB Chain: BNB, USDT, USDC, BTCB, ETH, SOL, XRP, ADA y DOGE.

<b>Cómo funciona:</b> tu operación va a las piscinas de PancakeSwap en una sola transacción que firmas tú. El resultado llega directo a tu wallet — el contrato no retiene nada.

<b>Costes:</b>
• Comisión DexCuba: <b>0,3%</b> — más baja que la de las wallets (MetaMask cobra 0,875%)
• PancakeSwap retiene un 0,25% para sus proveedores de liquidez (ya incluido en el precio que ves)
• Más el gas en BNB (céntimos)

<b>Protección:</b> antes de firmar ves un <b>mínimo garantizado</b>. Si el precio se mueve más de lo permitido, la operación se cancela sola en vez de darte menos.

<b>Nota:</b> los tokens son las versiones de BNB Chain. El SOL que conviertes vive en BNB Chain, no en la red Solana.`,
  },

  /* ====================== PLANES ====================== */
  planes: {
    titulo: 'Planes VIP y Business',
    texto:
`<b>Gratis</b>
• 3 ofertas activas en el P2P
• 3 enlaces de cobro activos
• 10 cobros de mostrador al día

<b>VIP — 5 USDT al año</b>
• Ofertas destacadas y primeras del tablero
• Hasta 15 ofertas activas
• Enlaces de cobro ilimitados
• Insignia VIP y reputación visibles en tus páginas de cobro
• 30 cobros de mostrador al día

<b>Business — 20 USDT al año</b>
• Todo lo del VIP
• <b>Mostrador sin límite diario</b> — pensado para negocios que cobran a diario

<b>Cómo se paga:</b> desde tu cuenta, con la wallet con la que entraste. Si entraste con TronLink pagas en USDT TRC-20; con MetaMask, en USDT BEP-20. El pago se verifica en la cadena y el plan se activa solo.

<b>Renovar suma tiempo</b>: si renuevas antes de que caduque, el año nuevo se añade al final del que tienes. No pierdes días.`,
  },

  comisiones: {
    titulo: 'Todas las comisiones',
    texto:
`<b>Escrow: 0,5%</b> — se descuenta al liberar. En reembolsos no se cobra.
<b>Convertidor: 0,3%</b> — más el 0,25% de PancakeSwap.
<b>Enlaces de cobro y mostrador: gratis.</b> El pago va directo de wallet a wallet.
<b>Mercado P2P: gratis</b> publicar y contactar. Solo pagas si usas el escrow.
<b>VIP: 5 USDT/año · Business: 20 USDT/año.</b>

Aparte están las <b>comisiones de red</b> (gas), que no cobra DexCuba sino la propia blockchain: unos céntimos en TRON y en BNB Chain.`,
  },

  /* ====================== SEGURIDAD ====================== */
  seguridad: {
    titulo: 'Seguridad: lo que debes saber',
    texto:
`<b>Nunca compartas tu frase de 12 palabras ni tu clave privada.</b> Ni con "soporte de DexCuba", ni con nadie. Quien te la pida quiere robarte. Nosotros jamás la pedimos.

<b>DexCuba nunca te escribirá primero</b> por Telegram o WhatsApp pidiendo datos, pagos o "verificaciones".

<b>Verifica siempre la dirección web</b>: <code>dexcuba.com</code>. Hay clones que cambian una letra.

<b>Antes de firmar cualquier cosa</b>, lee lo que te muestra la wallet. Firmar para entrar es gratis y no mueve fondos; una transacción sí.

<b>Cuidado con los pagos por fuera del escrow</b>: si alguien te propone saltarse el escrow "para ahorrar comisión", casi siempre es una estafa en preparación.

<b>Nuestro código es público</b>: los contratos están verificados y cualquiera puede leerlos. No tienes que confiar en nuestra palabra.`,
  },

  problemas: {
    titulo: 'Problemas frecuentes',
    texto:
`<b>"Account does not exist" (TRON)</b>
Esa cuenta aún no está activada. En TRON, una dirección nueva no existe hasta recibir su primer TRX. Envíale unos pocos y listo.

<b>"Out of energy" o "falta ancho de banda" (TRON)</b>
Tu cuenta necesita TRX para las comisiones. Ten siempre unos pocos.

<b>"Insufficient funds for gas" (BNB Chain)</b>
Te falta BNB para pagar el gas. El USDT no sirve para eso.

<b>No aparece el botón de conectar en el móvil</b>
Abre dexcuba.com <b>desde el navegador interno de tu wallet</b>, no desde Chrome o Safari.

<b>El pago no aparece como recibido</b>
Espera un minuto y recarga: verificamos en la cadena. Si pasan varios minutos, comprueba en el explorador que la transacción se confirmó y que la red era la correcta.

<b>Envié USDT por la red equivocada</b>
Si fue a una dirección tuya en la otra red, puede que aún los tengas: importa la wallet en una app que soporte esa red. Si fue a una dirección ajena, los fondos no se recuperan.`,
  },

  tasa_info: {
    titulo: 'La tasa de cambio',
    texto:
`Usamos la <b>tasa cripto del mercado informal cubano</b> que publica elTOQUE, no la del dólar en efectivo. Son distintas: el USDT suele cotizar con prima sobre el billete.

Esa tasa se construye con ofertas reales de grupos de Telegram y WhatsApp, sitios de clasificados y operaciones de exchanges cubanos.

<b>DexCuba no fija precios.</b> En el mercado P2P cada persona pone el suyo; la tasa solo sirve de referencia para comparar.

Escribe /tasa para ver la de hoy.`,
  },

  referidos: {
    titulo: 'Invita y gana',
    texto:
`Comparte tu enlace de recomendación y gana cuando alguien que traigas contrate un plan.

<b>Cómo funciona:</b>
1. Entra en tu cuenta en dexcuba.com y copia tu enlace (aparece en "Invita y gana")
2. Compártelo por WhatsApp, Telegram o donde quieras
3. Quien lo abra y cree su cuenta queda vinculado a ti
4. Si contrata <b>VIP o Business</b>, el <b>25%</b> de ese pago es tuyo

<b>Cobro:</b> a partir de 5 USDT acumulados puedes solicitar el pago escribiendo /soporte. Te lo enviamos a tu wallet.

<b>Reglas:</b>
• La vinculación ocurre una sola vez, al crear la cuenta, y no se puede cambiar después
• No puedes recomendarte a ti mismo
• El enlace caduca a los 60 días si la persona no se registra

<i>Nota: hoy la comisión se calcula sobre las suscripciones. Las operaciones de escrow ocurren directamente en la blockchain, así que no pasan por nuestros registros.</i>`,
  },

  legal: {
    titulo: 'Legal y privacidad',
    texto:
`<b>Qué guardamos:</b> tu dirección pública de wallet, el alias que elijas y tus valoraciones. Nada más.

<b>Qué NO guardamos:</b> documentos de identidad, datos bancarios, contraseñas, ni tus claves. No podemos filtrar lo que no tenemos.

<b>No custodiamos fondos.</b> DexCuba no es un banco ni una casa de cambio: es una herramienta para que dos personas operen directamente entre ellas.

<b>Riesgos:</b> operar con cripto tiene riesgos — volatilidad, errores de red irreversibles, y la posibilidad de tratar con alguien deshonesto. El escrow reduce el último, no elimina los demás.

Términos completos: dexcuba.com/legal.html`,
  },
};

/* Menú principal: qué botones se muestran y en qué orden */
export const MENU = [
  ['inicio', 'primeros_pasos'],
  ['escrow', 'escrow_ids'],
  ['cobros', 'mostrador'],
  ['convertidor', 'redes'],
  ['planes', 'comisiones'],
  ['seguridad', 'problemas'],
  ['tasa_info', 'disputa_info'],
  ['referidos'],
  ['legal'],
];
