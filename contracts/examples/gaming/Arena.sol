// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {Forge} from "./Forge.sol";
import {Hub} from "../../Hub.sol";

/// @title Arena - PvP registration hub for the Gaming Loot Box example
/// @notice Validates equipped item and registers player for PvP
contract Arena is Hub {
    error NoItemEquipped(address user);

    event PlayerRegistered(address indexed player);

    Forge private FORGE;

    mapping(address => bool) public isRegistered;
    address[] internal _registeredPlayers;

    /// @param forgeAddress Address of the Forge contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address forgeAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        FORGE = Forge(forgeAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("loot.arena", hubID);
    }

    /// @notice Get all registered players
    function getRegisteredPlayers() external view returns (address[] memory) {
        return _registeredPlayers;
    }

    /// @notice Get total number of registered players
    function totalRegisteredPlayers() external view returns (uint256) {
        return _registeredPlayers.length;
    }

    /// @dev Validate equipped item and register player, then route to TicketBooth
    function _userDidEnter(address userAddress) internal override {
        if (!FORGE.hasEquippedItem(userAddress))
            revert NoItemEquipped(userAddress);

        if (!isRegistered[userAddress]) {
            isRegistered[userAddress] = true;
            _registeredPlayers.push(userAddress);
            emit PlayerRegistered(userAddress);
        }

        _sendUserToHub(userAddress, "loot.ticket-booth");
    }
}
