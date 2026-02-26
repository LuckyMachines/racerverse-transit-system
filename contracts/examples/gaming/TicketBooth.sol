// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Forge} from "./Forge.sol";
import {LootRoll} from "./LootRoll.sol";
import {Hub} from "../../Hub.sol";

/// @title TicketBooth - Entry point hub for the Gaming Loot Box example
/// @notice Users call buyLootBox() to trigger the full transit flow:
///         TicketBooth → LootRoll → Forge → Arena → TicketBooth
contract TicketBooth is Hub {
    error InsufficientPayment(uint256 required, uint256 sent);

    event LootBoxPurchased(address indexed user, uint256 payment);
    event ArenaParticipantAdded(address indexed user);

    IERC20 internal GOLD_TOKEN;
    Forge internal FORGE;

    address[] internal _arenaParticipants;
    mapping(address => bool) public isArenaParticipant;
    mapping(address => uint256) public lootBoxesBought;

    uint256 public constant LOOT_BOX_PRICE = 0.05 ether;
    uint256 public constant GOLD_REWARD = 100 * 1e18;

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
        REGISTRY.setName("loot.ticket-booth", hubID);
    }

    /// @notice Set the gold token address (after it has been minted)
    /// @param goldTokenAddress Address of the GoldToken contract
    function setGoldTokenAddress(address goldTokenAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        GOLD_TOKEN = IERC20(goldTokenAddress);
    }

    /// @notice Buy a loot box, triggering the full transit flow
    function buyLootBox() external payable nonReentrant {
        if (msg.value < LOOT_BOX_PRICE)
            revert InsufficientPayment(LOOT_BOX_PRICE, msg.value);

        GOLD_TOKEN.transfer(msg.sender, GOLD_REWARD);
        lootBoxesBought[msg.sender]++;

        emit LootBoxPurchased(msg.sender, msg.value);
        _sendUserToHub(msg.sender, "loot.roll");
    }

    /// @notice Get all arena participants
    function getArenaParticipants() external view returns (address[] memory) {
        return _arenaParticipants;
    }

    /// @notice Get a player's stats summary
    /// @param player The address to query
    /// @return goldBalance The player's gold token balance
    /// @return boxesBought Number of loot boxes purchased
    /// @return hasItem Whether the player has an equipped item
    /// @return inArena Whether the player is registered in the arena
    function getPlayerStats(address player)
        external
        view
        returns (
            uint256 goldBalance,
            uint256 boxesBought,
            bool hasItem,
            bool inArena
        )
    {
        goldBalance = GOLD_TOKEN.balanceOf(player);
        boxesBought = lootBoxesBought[player];
        hasItem = FORGE.hasEquippedItem(player);
        inArena = isArenaParticipant[player];
    }

    /// @dev Add returning user to arena participant list
    function _userDidEnter(address userAddress) internal override {
        if (!isArenaParticipant[userAddress]) {
            isArenaParticipant[userAddress] = true;
            _arenaParticipants.push(userAddress);
            emit ArenaParticipantAdded(userAddress);
        }
    }
}
