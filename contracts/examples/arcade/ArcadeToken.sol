// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ArcadeToken - ERC20 currency for the Arcade Strip example
/// @notice Mints initial supply to the Arcade hub contract
contract ArcadeToken is ERC20 {
    /// @param arcadeAddress Address of the Arcade hub that receives initial supply
    constructor(address arcadeAddress) ERC20("ArcadeToken", "ARCADE") {
        _mint(arcadeAddress, 1_000_000 * 10 ** decimals());
    }
}
