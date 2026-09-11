// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Quorly USD
 * @notice A test stablecoin for Quorly demos on Base Sepolia.
 *
 * Circle's faucet caps out at 20 USDC, which isn't enough to demo a $20,000
 * high-value approval. QUSD mirrors USDC's interface and 6-decimal precision so
 * nothing in the app has to special-case it, and adds a public faucet anyone
 * can pull from.
 *
 * Deliberately minimal: no upgradeability, no pausing, no roles beyond a single
 * owner. This is demo money and should never be mistaken for anything else.
 */
contract QuorlyUSD {
    string public constant name = "Quorly USD";
    string public constant symbol = "QUSD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice How much one faucet pull delivers: 10,000 QUSD.
    uint256 public constant DRIP_AMOUNT = 10_000 * 10 ** 6;

    /// @notice Minimum wait between pulls for a given address.
    uint256 public constant DRIP_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastDrip;

    address public owner;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Drip(address indexed to, uint256 value);
    event OwnerChanged(address indexed from, address indexed to);

    error NotOwner();
    error DripTooSoon(uint256 availableAt);
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 initialSupply, address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        _mint(initialOwner, initialSupply);
    }

    /* ------------------------------------------------------------ ERC-20 */

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    /* ------------------------------------------------------------- faucet */

    /// @notice Pull DRIP_AMOUNT to your own address, at most once per cooldown.
    function drip() external {
        _drip(msg.sender);
    }

    /// @notice Pull to another address — lets the app top up a treasury wallet
    /// that holds no gas of its own.
    function dripTo(address to) external {
        if (to == address(0)) revert ZeroAddress();
        _drip(to);
    }

    function _drip(address to) internal {
        uint256 last = lastDrip[to];
        if (last != 0 && block.timestamp < last + DRIP_COOLDOWN) {
            revert DripTooSoon(last + DRIP_COOLDOWN);
        }
        lastDrip[to] = block.timestamp;
        _mint(to, DRIP_AMOUNT);
        emit Drip(to, DRIP_AMOUNT);
    }

    /// @notice Seconds until `account` may pull again. Zero means now.
    function dripAvailableIn(address account) external view returns (uint256) {
        uint256 last = lastDrip[account];
        if (last == 0) return 0;
        uint256 ready = last + DRIP_COOLDOWN;
        return block.timestamp >= ready ? 0 : ready - block.timestamp;
    }

    /* -------------------------------------------------------------- admin */

    function mint(address to, uint256 value) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /* ----------------------------------------------------------- internal */

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        unchecked {
            balanceOf[to] += value;
        }
        emit Transfer(address(0), to, value);
    }
}
