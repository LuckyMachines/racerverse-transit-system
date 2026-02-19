// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {LootRoll} from "./LootRoll.sol";
import {Hub} from "../../Hub.sol";

/// @title Forge - ERC721 item NFT minter + equip hub for the Gaming Loot Box example
/// @notice Mints an item NFT with the roll stats and equips it to the user
contract Forge is ERC721, Hub {
    event ItemForged(address indexed user, uint256 indexed tokenId, LootRoll.ItemType itemType, uint8 powerLevel);
    event ItemEquipped(address indexed user, uint256 indexed tokenId);

    struct ItemStats {
        LootRoll.ItemType itemType;
        uint8 powerLevel;
    }

    LootRoll private LOOT_ROLL;
    uint256 private _nextTokenId;

    /// @notice Token ID → item stats
    mapping(uint256 => ItemStats) public itemStats;
    /// @notice User address → currently equipped token ID
    mapping(address => uint256) public equippedItem;
    /// @notice User address → whether they have an equipped item
    mapping(address => bool) public hasEquippedItem;

    /// @param lootRollAddress Address of the LootRoll contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address lootRollAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) ERC721("LootItem", "LOOT") Hub(hubRegistryAddress, hubAdmin) {
        LOOT_ROLL = LootRoll(lootRollAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("loot.forge", hubID);
    }

    /// @notice Get the stats of a user's equipped item
    /// @param user The address to query
    /// @return stats The equipped item's stats
    function getEquippedStats(address user)
        external
        view
        returns (ItemStats memory stats)
    {
        require(hasEquippedItem[user], "No item equipped");
        stats = itemStats[equippedItem[user]];
    }

    /// @notice Check interface support (ERC721 + AccessControlEnumerable)
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, AccessControlEnumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Mint an item NFT with the roll stats, equip it, and route to the Arena
    function _userDidEnter(address userAddress) internal override {
        LootRoll.RollResult memory roll = LOOT_ROLL.getRollResult(userAddress);

        uint256 tokenId = _nextTokenId++;
        _safeMint(userAddress, tokenId);

        itemStats[tokenId] = ItemStats(roll.itemType, roll.powerLevel);
        equippedItem[userAddress] = tokenId;
        hasEquippedItem[userAddress] = true;

        emit ItemForged(userAddress, tokenId, roll.itemType, roll.powerLevel);
        emit ItemEquipped(userAddress, tokenId);

        _sendUserToHub(userAddress, "loot.arena");
    }
}
