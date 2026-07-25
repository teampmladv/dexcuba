#!/bin/bash
# =====================================================================
# DexCuba — verificación de integridad del build
# Ejecutar SIEMPRE antes de desplegar:  bash check.sh
# Si algo falla, NO despliegues: falta contenido o una edición rompió algo.
# =====================================================================
cd "$(dirname "$0")"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; FAIL=1; }

check() { # check "descripción" archivo patrón mínimo
  local n; n=$(grep -c "$3" "$2" 2>/dev/null); [ -z "$n" ] && n=0
  if [ "$n" -ge "$4" ]; then ok "$1"; else bad "$1 (encontrado $n, esperaba >=$4 en $2)"; fi
}

echo "— Convertidor —"
check "9 tokens configurados"            config.js       "sym: '"           9
check "SOL presente"                     config.js       "sym: 'SOL'"       1
check "comisión dinámica (feeBps)"       convertir.html  "feeBps"           2
check "selector multimoneda"             convertir.html  "fillSelects"      2
check "estilos oscuros de select"        convertir.html  "select option{background" 1

echo "— Redes y escrow —"
check "config EVM (BSC)"                 config.js       "chainIdHex"       2
check "escrow BSC enlazado desde TRON"   escrow.html     "escrow-bsc"       1
check "escrow TRON enlazado desde BSC"   escrow-bsc.html 'href="/escrow.html"' 1
check "faucet protegido por entorno"     escrow.html     "CFG.net.faucet"   2

echo "— P2P —"
check "campo de red en ofertas"          p2p.html        "fNetwork"         3
check "la red se envía en el payload"    p2p.html        "network:document.getElementById" 1
check "cambio de red (netswap)"          p2p.html        "swapCard"         2
check "backend valida la red"            functions/api/offers.js "NETWORKS_OK" 2
check "backend acepta netswap"           functions/api/offers.js "netswap"   2

echo "— Navegación y limpieza —"
if grep -rqn 'swap\.html' index.html p2p.html escrow.html escrow-bsc.html cuenta.html convertir.html legal.html 2>/dev/null; then
  bad "quedan enlaces a swap.html fuera de la redirección"
else ok "sin enlaces residuales a swap.html"; fi
check "nav lleva a Convertir"            index.html      "convertir.html"   2
for f in index convertir cobrar pagar p2p escrow escrow-bsc cuenta legal; do
  check "Cobrar en el menú de $f"          $f.html         'cobrar.html'      1
done

echo "— Enlaces de cobro (fase 1) —"
check "API de cobros"                    functions/api/pay.js "onRequestPut"  1
check "verificación TRON"                functions/api/pay.js "verifyTron"    2
check "verificación BSC"                 functions/api/pay.js "verifyBsc"     2
check "página de crear cobro"            cobrar.html     "createPay"        2
check "página de pago con QR real"       pagar.html      "qrcodejs"         1
check "pago TRC-20 y BEP-20"             pagar.html      "payTron\|payBsc"  2
check "QR real en el dashboard"          index.html      "qrcodejs"         1
check "acceso a Cobrar desde la home"    index.html      "cobrar.html"      2
check "límite de enlaces por plan"       functions/api/pay.js "limite_alcanzado" 1
check "historial de cobros (API)"        functions/api/pay.js "whoami"           2
check "historial en Mi cuenta"           cuenta.html     "loadPays"         2
check "insignia VIP en la página de pago" pagar.html     "PAY.vip"          1
check "beneficio VIP de cobros anunciado" functions/api/vip.js "Enlaces de cobro" 1
check "modo POS en el backend"           functions/api/pay.js "mode: isPos"      1
check "autodeteccion TRON"               functions/api/pay.js "scanTron"         2
check "autodeteccion BSC"                functions/api/pay.js "scanBsc"          2
check "mostrador: teclado"               mostrador.html  "buildKeypad"      2
check "mostrador: cobro en CUP"          mostrador.html  "setCur"           2
check "mostrador: sondeo del pago"       mostrador.html  "check=1"          1
check "mostrador enlazado desde cobrar"  cobrar.html     "mostrador.html"   1
check "mostrador: conectar wallet"       mostrador.html  "useWallet"        2
check "mostrador: carga wallet.js"       mostrador.html  "wallet.js"        1
check "limite diario del mostrador"      functions/api/pay.js "limite_diario" 1
check "plan Business en vip.js"          functions/api/vip.js "PRICE_BIZ"    2
check "compra Business en Mi cuenta"     cuenta.html     "payVip(20)"       1
check "estado Business al cargar"        cuenta.html     "d.business"       1
check "registro contable de suscripciones" functions/api/vip.js "sublog:"      1
n=$(grep -c "const at = " functions/api/vip.js); [ -z "$n" ] && n=0
if [ "$n" -eq 1 ]; then ok "registro contable sin duplicados"; else bad "registro contable duplicado ($n declaraciones de at)"; fi
check "API admin de suscripciones"       functions/admin/subs.js "sublog:"    1
check "panel admin de suscripciones"     admin/suscripciones.html "admin/subs" 1

echo "— Infraestructura —"
check "binding USERS en wrangler"        wrangler.toml   'binding = "USERS"' 1
check "binding OFFERS en wrangler"       wrangler.toml   'binding = "OFFERS"' 1
check "service worker v2"                sw.js           "dexcuba-v2"       1
check "PWA manifest enlazado"            index.html      "manifest.json"    1

echo "— Sintaxis JS de todas las páginas —"
for f in index p2p escrow escrow-bsc cuenta convertir legal; do
  node -e "
    const fs=require('fs');
    const s=fs.readFileSync('$f.html','utf8');
    const m=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    if(m.length){
      const js=m.reduce((a,b)=>a[1]&&a[1].length>b[1].length?a:b);
      new Function(js[1]);
    }
  " 2>/dev/null && ok "$f.html" || bad "$f.html tiene un error de sintaxis JS"
done
for f in config.js wallet.js cookies.js pwa.js sw.js; do
  node --check "$f" >/dev/null 2>&1 && ok "$f" || bad "$f tiene un error de sintaxis"
done

echo ""
if [ $FAIL -eq 0 ]; then
  echo "✅ TODO CORRECTO — listo para desplegar."
else
  echo "❌ HAY FALLOS — no despliegues hasta corregirlos."
  exit 1
fi
