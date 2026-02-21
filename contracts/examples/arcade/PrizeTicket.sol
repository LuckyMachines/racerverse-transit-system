// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title PrizeTicket - ERC20 prize tickets for the Arcade Strip example
/// @notice Mints initial supply to the CoinPusher hub contract
contract PrizeTicket is ERC20 {
    /// @param coinPusherAddress Address of the CoinPusher hub that receives initial supply
    constructor(address coinPusherAddress) ERC20("PrizeTicket", "TICKET") {
        _mint(coinPusherAddress, 1_000_000 * 10 ** decimals());
    }
}
