// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/**
 * DexCubaEscrow — escrow no-custodial para intercambios USDT/CUP (TRON, TRC-20).
 *
 * MODELO
 *  - El VENDEDOR de USDT bloquea el monto en el contrato (crea el trade).
 *  - El COMPRADOR paga el CUP FUERA de la cadena (efectivo/transferencia) y
 *    marca "pagado" en el contrato.
 *  - El VENDEDOR confirma y libera el USDT al comprador.
 *  - Si hay disputa, el ÁRBITRO decide: libera al comprador o reembolsa al
 *    vendedor. El árbitro NUNCA puede llevarse los fondos para sí mismo:
 *    el USDT solo puede ir al comprador (menos la comisión) o al vendedor.
 *  - Comisión de plataforma (feeBps, p. ej. 50 = 0,5 %): se descuenta del USDT
 *    SOLO al liberar (operación exitosa) y va a feeCollector. En reembolsos no
 *    se cobra. Tope duro de 1 % para que nunca pueda ser abusiva. Esta es la
 *    propiedad de seguridad central del contrato.
 *  - Si el comprador nunca marca "pagado", el vendedor puede recuperar su USDT
 *    tras un plazo de seguridad (AUTO_REFUND_DELAY), evitando fondos atrapados.
 *
 * ADVERTENCIA
 *  Este contrato NO ha sido auditado. Antes de usarlo con dinero real:
 *   1) Despliégalo y pruébalo en la testnet Nile con montos pequeños.
 *   2) Encarga una auditoría profesional.
 *   3) Considera que el árbitro es un punto de confianza: idealmente debe ser
 *      un multisig o un tercero neutral, no una sola llave tuya.
 */

interface ITRC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract DexCubaEscrow {
    /// Token bloqueado (USDT-TRC20). Se fija al desplegar.
    address public immutable token;

    /// Plazo tras el cual el vendedor puede auto-reembolsarse si el comprador
    /// nunca marcó "pagado". Da margen para que el comprador actúe.
    uint256 public constant AUTO_REFUND_DELAY = 3 days;

    /// Comisión de plataforma en puntos básicos (50 = 0,5 %). Fija al desplegar,
    /// con tope máximo de 100 (1 %) para que nunca pueda ser abusiva.
    uint256 public immutable feeBps;
    /// Dirección que recibe la comisión. El owner puede actualizarla.
    address public feeCollector;
    /// Puede cambiar únicamente la dirección que cobra la comisión.
    address public owner;

    enum State { NONE, FUNDED, PAID, RELEASED, REFUNDED }

    struct Trade {
        address seller;
        address buyer;
        address arbitrator;
        uint256 amount;
        uint64  fundedAt;
        State   state;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Trade) public trades;

    // Guard de reentrada simple.
    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    event Created(uint256 indexed id, address indexed seller, address indexed buyer, address arbitrator, uint256 amount);
    event MarkedPaid(uint256 indexed id);
    event Released(uint256 indexed id, address to, uint256 amountToBuyer, uint256 fee);
    event Refunded(uint256 indexed id, address to);
    event FeeCollectorChanged(address indexed newCollector);

    constructor(address _token, address _feeCollector, uint256 _feeBps) {
        require(_token != address(0), "token=0");
        require(_feeCollector != address(0), "feeCollector=0");
        require(_feeBps <= 100, "fee>1%"); // tope duro de seguridad
        token = _token;
        feeCollector = _feeCollector;
        feeBps = _feeBps;
        owner = msg.sender;
    }

    /// Cambia la dirección que cobra la comisión. Solo el owner.
    function setFeeCollector(address a) external {
        require(msg.sender == owner, "only owner");
        require(a != address(0), "zero");
        feeCollector = a;
        emit FeeCollectorChanged(a);
    }

    /**
     * Crea y financia un trade. El VENDEDOR debe haber hecho approve() de este
     * contrato por `amount` en el token USDT antes de llamar aquí.
     */
    function createTrade(address buyer, address arbitrator, uint256 amount)
        external
        nonReentrant
        returns (uint256 id)
    {
        require(buyer != address(0) && arbitrator != address(0), "bad addr");
        require(amount > 0, "amount=0");
        require(buyer != msg.sender, "buyer==seller");

        id = nextId++;
        trades[id] = Trade({
            seller: msg.sender,
            buyer: buyer,
            arbitrator: arbitrator,
            amount: amount,
            fundedAt: uint64(block.timestamp),
            state: State.FUNDED
        });

        _pull(msg.sender, amount);
        emit Created(id, msg.sender, buyer, arbitrator, amount);
    }

    /// El COMPRADOR señala que ya envió el CUP. Bloquea el auto-reembolso.
    function markPaid(uint256 id) external {
        Trade storage t = trades[id];
        require(t.state == State.FUNDED, "not funded");
        require(msg.sender == t.buyer, "only buyer");
        t.state = State.PAID;
        emit MarkedPaid(id);
    }

    /**
     * Libera el USDT al COMPRADOR, descontando la comisión de plataforma.
     * Puede llamarlo el VENDEDOR (confirma que recibió el CUP) o el ÁRBITRO
     * (resuelve disputa a favor del comprador). La comisión SOLO se cobra aquí,
     * en operaciones completadas con éxito; en los reembolsos no se cobra nada.
     */
    function release(uint256 id) external nonReentrant {
        Trade storage t = trades[id];
        require(t.state == State.FUNDED || t.state == State.PAID, "bad state");
        require(msg.sender == t.seller || msg.sender == t.arbitrator, "not allowed");
        t.state = State.RELEASED;

        uint256 fee = (t.amount * feeBps) / 10000;
        uint256 toBuyer = t.amount - fee;
        _push(t.buyer, toBuyer);
        if (fee > 0) _push(feeCollector, fee);
        emit Released(id, t.buyer, toBuyer, fee);
    }

    /**
     * Reembolsa el USDT al VENDEDOR.
     *  - El ÁRBITRO puede hacerlo en cualquier momento (disputa a favor del vendedor).
     *  - El VENDEDOR puede hacerlo solo si el comprador NO marcó "pagado" y ya
     *    pasó AUTO_REFUND_DELAY.
     */
    function refund(uint256 id) external nonReentrant {
        Trade storage t = trades[id];
        require(t.state == State.FUNDED || t.state == State.PAID, "bad state");

        if (msg.sender == t.arbitrator) {
            // permitido siempre
        } else if (msg.sender == t.seller) {
            require(t.state == State.FUNDED, "buyer marked paid");
            require(block.timestamp >= t.fundedAt + AUTO_REFUND_DELAY, "too early");
        } else {
            revert("not allowed");
        }

        t.state = State.REFUNDED;
        _push(t.seller, t.amount);
        emit Refunded(id, t.seller);
    }

    /// Lectura cómoda del estado de un trade.
    function getTrade(uint256 id)
        external
        view
        returns (address seller, address buyer, address arbitrator, uint256 amount, uint64 fundedAt, State state)
    {
        Trade storage t = trades[id];
        return (t.seller, t.buyer, t.arbitrator, t.amount, t.fundedAt, t.state);
    }

    // --- transferencias seguras (compatibles con tokens que no devuelven bool) ---

    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(ITRC20.transferFrom.selector, from, address(this), amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "pull failed");
    }

    function _push(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(ITRC20.transfer.selector, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "push failed");
    }
}
