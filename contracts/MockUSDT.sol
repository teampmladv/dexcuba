// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/**
 * MockUSDT — token TRC-20 de PRUEBA para testear DexCubaEscrow.
 *
 * SOLO PARA TESTNET / VM. No usar en mainnet.
 * Imita al USDT: 6 decimales y la función mint() abierta para que cualquiera
 * se dé saldo de prueba y pueda ejecutar approve / transferFrom contra el escrow.
 *
 * Uso típico en el IDE de TRON:
 *   1) Deploy de este contrato (sin argumentos).
 *   2) mint(tuDireccion, 1000000000)  -> te das 1000 USDT de prueba (6 decimales).
 *   3) approve(direccionDelEscrow, 100000000) -> autorizas 100 USDT al escrow.
 *   4) En el escrow: createTrade(...), release(...), etc.
 */
contract MockUSDT {
    string public name = "Mock Tether USD";
    string public symbol = "USDT";
    uint8  public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// Crea saldo de prueba. Abierta a propósito: cualquiera puede darse fondos.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) {
            allowance[from][msg.sender] = a - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        require(to != address(0), "to=0");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
