// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ClawMachine} from "./ClawMachine.sol";
import {Hub} from "../../Hub.sol";

/// @title PrizeCounter - Validation hub for the Arcade Strip example
/// @notice Validates user owns a plushie NFT, records prize count, routes back to Arcade
contract PrizeCounter is Hub {
    error NoPlushieOwned(address user);

    event PrizeRecorded(address indexed user);

    ClawMachine private CLAW_MACHINE;

    mapping(address => uint256) public prizesRecorded;
    uint256 public totalPrizesAwarded;

    /// @param clawMachineAddress Address of the ClawMachine contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address clawMachineAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        CLAW_MACHINE = ClawMachine(clawMachineAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("arcade.prize-counter", hubID);
    }

    /// @dev Validate plushie ownership, record prize, route to Arcade
    function _userDidEnter(address userAddress) internal override {
        if (CLAW_MACHINE.balanceOf(userAddress) == 0)
            revert NoPlushieOwned(userAddress);

        prizesRecorded[userAddress]++;
        totalPrizesAwarded++;

        emit PrizeRecorded(userAddress);
        _sendUserToHub(userAddress, "arcade.entrance");
    }
}
