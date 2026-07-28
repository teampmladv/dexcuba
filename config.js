/* =====================================================================
   DexCuba — Configuración central de red
   ---------------------------------------------------------------------
   Un único sitio donde viven las direcciones de contratos y la red.
   El entorno se detecta automáticamente:

     · SANDBOX  → cualquier ruta bajo /admin/  ........... testnet Nile
     · SANDBOX  → hostname localhost / *.pages.dev ....... testnet Nile
     · PRODUCCIÓN → dexcuba.com y www.dexcuba.com ........ mainnet TRON

   Así, las vistas previas y la zona de administración nunca tocan dinero
   real, y producción nunca apunta a contratos de prueba.

   Se puede forzar un entorno añadiendo ?net=nile o ?net=mainnet a la URL
   (útil para probar), y queda recordado en la sesión.
   ===================================================================== */
(function () {
  'use strict';

  var NETWORKS = {
    nile: {
      id: 'nile',
      label: 'NILE · PRUEBAS',
      name: 'testnet Nile',
      host: 'nile.trongrid.io',
      explorer: 'https://nile.tronscan.org',
      isTestnet: true,
      // Contratos desplegados en Nile
      escrow: 'TQEx3byyEVnRZjUjV13YWZRcAoVTSnt21P',
      arbitrator: 'THjEBe4AhazZ2AzESeWbnrD2vRuTkrFgaZ', // árbitro de pruebas en Nile
      usdt: 'THqLa2Mn79tySjQTGwgRYD5y7ca6ryMPZS', // MockUSDT (tiene mint)
      usdtDecimals: 6,
      faucet: true,   // permite darse USDT de prueba
      router: '',     // SunSwap no opera en Nile
      wtrx: ''
    },
    mainnet: {
      id: 'mainnet',
      label: 'MAINNET · REAL',
      name: 'red principal de TRON',
      host: 'api.trongrid.io',
      explorer: 'https://tronscan.org',
      isTestnet: false,
      escrow: 'TUcZmJv5e9bnRJ7TGsY8LCK2QVMtiEDsva',
      arbitrator: 'TJbjznR4eci4efanpRfhi3ARHXAVvEwrxH', // Ledger de DexCuba — árbitro oficial
      usdt: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT-TRC20 oficial
      usdtDecimals: 6,
      faucet: false,  // en mainnet no hay faucet: el USDT real no tiene mint
      router: '',     // router de SunSwap verificado
      wtrx: ''
    }
  };

  /* ---- Redes EVM (BNB Smart Chain, para USDT BEP-20) ----
     ⚠️ El USDT BEP-20 usa 18 DECIMALES (el TRC-20 usa 6). Nunca mezclar. */
  var EVM_NETWORKS = {
    bscTestnet: {
      id: 'bscTestnet',
      label: 'BSC TESTNET · PRUEBAS',
      name: 'testnet de BNB Smart Chain',
      chainId: 97,
      chainIdHex: '0x61',
      rpc: 'https://bsc-testnet-rpc.publicnode.com',
      explorer: 'https://testnet.bscscan.com',
      isTestnet: true,
      escrow: '0xDfc9d2bE31339AED9BD2E3C5426EfeeF3C25f8F4',
      usdt: '0x6414f8E45D0b51277Df89570613A1B0ea81FEd60', // MockUSDT (mint abierto)
      converter: '0xACDbd6BC6298A53E67Cf57B4396918821a679772',
      arbitrator: '0xe7024D982a9d71381473f7AFf54DA5655bc380B0', // árbitro de pruebas
      router: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',  // PancakeSwap testnet
      wbnb: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',    // WBNB testnet
      // En testnet solo hay liquidez fiable para el par de prueba
      tokens: [
        { sym: 'BNB',  name: 'BNB',              addr: 'BNB', dec: 18 },
        { sym: 'USDT', name: 'USDT de prueba',   addr: '0x6414f8E45D0b51277Df89570613A1B0ea81FEd60', dec: 18 }
      ],
      usdtDecimals: 18,
      faucet: true,
      gasSymbol: 'tBNB'
    },
    bsc: {
      id: 'bsc',
      label: 'BSC · REAL',
      name: 'BNB Smart Chain',
      chainId: 56,
      chainIdHex: '0x38',
      rpc: 'https://bsc-dataseed.binance.org',
      explorer: 'https://bscscan.com',
      isTestnet: false,
      escrow: '0xFb3005e639173Fbf95c1A3076E748ab48B9d7b59',
      usdt: '0x55d398326f99059fF775485246999027B3197955', // USDT BEP-20 oficial (BSC-USD)
      converter: '0xa5db8AC2B2dd01a83b6592e2C5328A4E2c7F5961',
      arbitrator: '0xbdF00EAe0F9Be4FeE80A58Cac297F8eafe7a2b2f', // Ledger de DexCuba — árbitro oficial
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2 — verificar en docs/BscScan
      wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',   // WBNB oficial
      // ⚠️ Verificar cada dirección en bscscan.com antes de mainnet.
      // Todos los tokens peg de BSC usan 18 decimales.
      tokens: [
        { sym: 'BNB',  name: 'BNB',                addr: 'BNB', dec: 18 },
        { sym: 'USDT', name: 'Tether USD',         addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18 },
        { sym: 'USDC', name: 'USD Coin',           addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', dec: 18 },
        { sym: 'BTCB', name: 'Bitcoin (BEP-20)',   addr: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', dec: 18 },
        { sym: 'ETH',  name: 'Ethereum (BEP-20)',  addr: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', dec: 18 },
        { sym: 'SOL',  name: 'Solana (BEP-20)',    addr: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', dec: 18 },
        { sym: 'XRP',  name: 'XRP (BEP-20)',       addr: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', dec: 18 },
        { sym: 'ADA',  name: 'Cardano (BEP-20)',   addr: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47', dec: 18 },
        { sym: 'DOGE', name: 'Dogecoin (BEP-20)',  addr: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', dec: 8 }
      ],
      usdtDecimals: 18,
      faucet: false,
      gasSymbol: 'BNB'
    }
  };

  function detect() {
    // 1. Forzado manual por querystring (?net=nile) — se recuerda en la sesión
    try {
      var q = new URLSearchParams(location.search).get('net');
      if (q && NETWORKS[q]) { sessionStorage.setItem('dx_net', q); return q; }
      var saved = sessionStorage.getItem('dx_net');
      if (saved && NETWORKS[saved]) return saved;
    } catch (e) { /* sessionStorage puede estar bloqueado */ }

    var h = location.hostname;
    var p = location.pathname;

    // 2. Zona de administración → siempre pruebas
    if (p.indexOf('/admin/') === 0) return 'nile';

    // 3. Desarrollo local y vistas previas → pruebas
    if (h === 'localhost' || h === '127.0.0.1' || h === '' ) return 'nile';
    if (h.indexOf('.pages.dev') !== -1) return 'nile';

    // 4. Dominio de producción → red real
    if (h === 'dexcuba.com' || h === 'www.dexcuba.com') return 'mainnet';

    // 5. Cualquier otro caso: lo más seguro es pruebas
    return 'nile';
  }

  var netId = detect();
  var net = NETWORKS[netId];
  // La red EVM sigue el mismo criterio: pruebas en admin/preview/local, real en dexcuba.com
  var evmNet = EVM_NETWORKS[net.isTestnet ? 'bscTestnet' : 'bsc'];

  var CFG = {
    net: net,
    networks: NETWORKS,
    evm: evmNet,
    evmNetworks: EVM_NETWORKS,
    FEE_BPS: 50,          // 0,5 % de comisión del escrow
    USDT_DECIMALS: 6,
    FEE_LIMIT: 150000000, // 150 TRX de tope de energía

    /* ¿Está el entorno listo para operar? En mainnet exige que el escrow
       esté desplegado; evita que la interfaz parezca funcional sin contrato. */
    isReady: function () { return !!net.escrow; },

    /* Comprueba que TronLink está en la red que esperan estos contratos. */
    matchesWallet: function (tronWeb) {
      try {
        var host = (tronWeb && tronWeb.fullNode && tronWeb.fullNode.host) || '';
        return host.indexOf(net.host) !== -1;
      } catch (e) { return false; }
    },

    walletHost: function (tronWeb) {
      try { return ((tronWeb && tronWeb.fullNode && tronWeb.fullNode.host) || '').replace('https://', ''); }
      catch (e) { return ''; }
    },

    txUrl: function (txid) { return net.explorer + '/#/transaction/' + txid; },
    addrUrl: function (a) { return net.explorer + '/#/address/' + a; }
  };

  window.DEXCUBA = CFG;

  /* ---- Aviso visual automático ----
     Pinta el badge de red y la franja superior en cualquier página que
     tenga los elementos #netBadge / #netStrip. Se vuelve a llamar tras
     conectar la wallet para detectar si el usuario está en otra red. */
  CFG.paintNetworkUI = function (tronWeb) {
    var badge = document.getElementById('netBadge');
    var strip = document.getElementById('netStrip');
    if (badge) {
      // En producción no se muestra: el usuario no necesita ver etiquetas de red.
      badge.style.display = net.isTestnet ? 'inline-block' : 'none';
      badge.textContent = net.isTestnet ? 'PRUEBAS' : '';
      badge.className = 'net-badge';
    }
    if (strip) {
      strip.className = 'net-strip' + (net.isTestnet ? '' : ' mainnet');
      strip.innerHTML = net.isTestnet
        ? '🧪 Modo de prueba · el dinero aquí no es real'
        : '';
      strip.style.display = net.isTestnet ? 'block' : 'none';
    }
    // Si hay wallet conectada y está en otra red, avisar en rojo
    if (tronWeb && !CFG.matchesWallet(tronWeb)) {
      var h = CFG.walletHost(tronWeb) || 'desconocida';
      if (badge) { badge.textContent = 'RED INCORRECTA'; badge.className = 'net-badge wrong'; }
      if (strip) {
        strip.style.display = 'block';
        strip.className = 'net-strip wrong';
        strip.innerHTML = '⚠️ Tu wallet está en otra red. Cámbiala a <b>' +
          (net.isTestnet ? 'Nile' : 'Mainnet') + '</b> en tu wallet para poder operar.';
      }
      return false;
    }
    return true;
  };
})();
