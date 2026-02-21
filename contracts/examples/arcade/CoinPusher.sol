// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hub} from "../../Hub.sol";

/// @title CoinPusher - Game hub for the Arcade Strip example
/// @notice Takes 50 ArcadeTokens via transferFrom, awards random PrizeTickets
/// @dev Uses block.prevrandao + block.timestamp for randomness — NOT production-safe
contract CoinPusher is Hub {
    event CoinsPushed(address indexed user, PrizeLevel level, uint256 ticketsWon);

    enum PrizeLevel { Consolation, SmallWin, BigWin, Jackpot }

    IERC20 internal ARCADE_TOKEN;
    IERC20 internal PRIZE_TICKET;

    uint256 public constant PLAY_COST = 50 * 1e18;
    uint256 public totalPlays;

    mapping(address => uint256) public lastTicketsWon;

    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(address hubRegistryAddress, address hubAdmin)
        Hub(hubRegistryAddress, hubAdmin)
    {
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("arcade.coin-pusher", hubID);
    }

    /// @notice Set the arcade token address
    /// @param arcadeTokenAddress Address of the ArcadeToken contract
    function setArcadeTokenAddress(address arcadeTokenAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        ARCADE_TOKEN = IERC20(arcadeTokenAddress);
    }

    /// @notice Set the prize ticket address
    /// @param prizeTicketAddress Address of the PrizeTicket contract
    function setPrizeTicketAddress(address prizeTicketAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        PRIZE_TICKET = IERC20(prizeTicketAddress);
    }

    /// @dev Take ArcadeTokens, roll prize, award PrizeTickets, route to ClawMachine
    function _userDidEnter(address userAddress) internal override {
        // Take 50 ArcadeTokens from user
        ARCADE_TOKEN.transferFrom(userAddress, address(this), PLAY_COST);

        // Roll random prize
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(block.prevrandao, block.timestamp, userAddress)
            )
        );

        uint256 roll = seed % 100;
        PrizeLevel level;
        uint256 tickets;

        if (roll < 5) {
            // 5% chance: Jackpot — 200 tickets
            level = PrizeLevel.Jackpot;
            tickets = 200 * 1e18;
        } else if (roll < 20) {
            // 15% chance: BigWin — 100 tickets
            level = PrizeLevel.BigWin;
            tickets = 100 * 1e18;
        } else if (roll < 50) {
            // 30% chance: SmallWin — 50 tickets
            level = PrizeLevel.SmallWin;
            tickets = 50 * 1e18;
        } else {
            // 50% chance: Consolation — 10 tickets
            level = PrizeLevel.Consolation;
            tickets = 10 * 1e18;
        }

        PRIZE_TICKET.transfer(userAddress, tickets);
        lastTicketsWon[userAddress] = tickets;
        totalPlays++;

        emit CoinsPushed(userAddress, level, tickets);
        _sendUserToHub(userAddress, "arcade.claw-machine");
    }
}
