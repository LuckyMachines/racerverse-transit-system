// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ClawMachine} from "./ClawMachine.sol";
import {Hub} from "../../Hub.sol";

/// @title Arcade - Entry point hub for the Arcade Strip example
/// @notice Users call playArcade() to trigger the full transit flow:
///         Arcade → CoinPusher → ClawMachine → PrizeCounter → Arcade
contract Arcade is Hub {
    error InsufficientPayment(uint256 required, uint256 sent);

    event ArcadePlayed(address indexed user, uint256 payment);
    event HallOfFameAdded(address indexed user);

    IERC20 internal ARCADE_TOKEN;
    ClawMachine internal CLAW_MACHINE;

    address[] internal _hallOfFame;
    mapping(address => bool) public isInHallOfFame;
    mapping(address => uint256) public timesPlayed;

    uint256 public constant ENTRY_PRICE = 0.02 ether;
    uint256 public constant TOKEN_REWARD = 50 * 1e18;

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
        REGISTRY.setName("arcade.entrance", hubID);
    }

    /// @notice Set the arcade token address (after it has been minted)
    /// @param arcadeTokenAddress Address of the ArcadeToken contract
    function setArcadeTokenAddress(address arcadeTokenAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        ARCADE_TOKEN = IERC20(arcadeTokenAddress);
    }

    /// @notice Play the arcade, triggering the full transit flow
    function playArcade() external payable nonReentrant {
        if (msg.value < ENTRY_PRICE)
            revert InsufficientPayment(ENTRY_PRICE, msg.value);

        ARCADE_TOKEN.transfer(msg.sender, TOKEN_REWARD);
        timesPlayed[msg.sender]++;

        emit ArcadePlayed(msg.sender, msg.value);
        _sendUserToHub(msg.sender, "arcade.coin-pusher");
    }

    /// @notice Get the hall of fame
    function getHallOfFame() external view returns (address[] memory) {
        return _hallOfFame;
    }

    /// @notice Get a player's stats summary
    /// @param player The address to query
    /// @return tokenBalance The player's arcade token balance
    /// @return plays Number of times played
    /// @return hasPlushie Whether the player owns a plushie NFT
    /// @return inHallOfFame Whether the player is in the hall of fame
    function getPlayerStats(address player)
        external
        view
        returns (
            uint256 tokenBalance,
            uint256 plays,
            bool hasPlushie,
            bool inHallOfFame
        )
    {
        tokenBalance = ARCADE_TOKEN.balanceOf(player);
        plays = timesPlayed[player];
        hasPlushie = CLAW_MACHINE.balanceOf(player) > 0;
        inHallOfFame = isInHallOfFame[player];
    }

    /// @dev Add returning user to hall of fame
    function _userDidEnter(address userAddress) internal override {
        if (!isInHallOfFame[userAddress]) {
            isInHallOfFame[userAddress] = true;
            _hallOfFame.push(userAddress);
            emit HallOfFameAdded(userAddress);
        }
    }
}
