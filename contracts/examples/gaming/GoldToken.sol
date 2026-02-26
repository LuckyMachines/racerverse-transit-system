// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title GoldToken - ERC20 game currency for the Gaming Loot Box example
/// @notice Mints initial supply to the TicketBooth contract
contract GoldToken is ERC20 {
    /// @param ticketBoothAddress Address of the TicketBooth that receives initial supply
    constructor(address ticketBoothAddress) ERC20("GoldToken", "GOLD") {
        _mint(ticketBoothAddress, 1_000_000 * 10 ** decimals());
    }
}
