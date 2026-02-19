// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {Hub} from "../../Hub.sol";

/// @title LootRoll - Pseudo-random item roll hub for the Gaming Loot Box example
/// @notice Rolls a random item type and power level when a user enters
/// @dev Uses block.prevrandao + block.timestamp for randomness — NOT production-safe
contract LootRoll is Hub {
    error NotRolled(address user);

    event ItemRolled(address indexed user, ItemType itemType, uint8 powerLevel);

    enum ItemType { Sword, Shield, Potion }

    struct RollResult {
        ItemType itemType;
        uint8 powerLevel;
        bool rolled;
    }

    mapping(address => RollResult) public rollResults;

    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(address hubRegistryAddress, address hubAdmin)
        Hub(hubRegistryAddress, hubAdmin)
    {
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("loot.roll", hubID);
    }

    /// @notice Get the roll result for a user
    /// @param user The address to query
    /// @return result The roll result struct
    function getRollResult(address user)
        external
        view
        returns (RollResult memory result)
    {
        if (!rollResults[user].rolled) revert NotRolled(user);
        result = rollResults[user];
    }

    /// @dev Roll a random item and route to the Forge
    function _userDidEnter(address userAddress) internal override {
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(block.prevrandao, block.timestamp, userAddress)
            )
        );

        ItemType itemType = ItemType(seed % 3);
        uint8 powerLevel = uint8((seed >> 8) % 100) + 1; // 1–100

        rollResults[userAddress] = RollResult(itemType, powerLevel, true);
        emit ItemRolled(userAddress, itemType, powerLevel);

        _sendUserToHub(userAddress, "loot.forge");
    }
}
