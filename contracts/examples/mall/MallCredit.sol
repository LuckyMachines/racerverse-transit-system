// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MallCredit - ERC20 currency for the Mall Crawl example
/// @notice Mints initial supply to the Concourse and GameRoom hubs
contract MallCredit is ERC20 {
    /// @param concourseAddress Address of the Concourse hub (receives 500K for credit distribution)
    /// @param gameRoomAddress Address of the GameRoom hub (receives 500K for prize payouts)
    constructor(address concourseAddress, address gameRoomAddress)
        ERC20("MallCredit", "MCRED")
    {
        _mint(concourseAddress, 500_000 * 10 ** decimals());
        _mint(gameRoomAddress, 500_000 * 10 ** decimals());
    }
}
