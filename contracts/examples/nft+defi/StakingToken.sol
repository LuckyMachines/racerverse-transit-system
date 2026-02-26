// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StakingToken - Sample ERC20 token for the transit system example
/// @notice Mints initial supply to a DEX contract for liquidity
contract StakingToken is ERC20 {
    /// @param dexAddress Address of the DEX that receives initial liquidity
    constructor(address dexAddress) ERC20("StakingToken", "STK") {
        _mint(dexAddress, 100_000 * 10 ** decimals());
    }
}
