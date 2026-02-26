// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Stake} from "./Stake.sol";
import {Hub} from "../../Hub.sol";
import {DEX} from "./DEX.sol";

/// @title NFTDefiHub - Central hub for the NFT+DeFi transit example
/// @notice Users call claimNFT() to trigger the full transit flow:
///         MainHub → DEX → Stake → ExclusiveNFT → MainHub
contract NFTDefiHub is Hub {
    error InsufficientPayment(uint256 required, uint256 sent);
    error NFTRequired();

    event NFTClaimed(address indexed user, uint256 payment);
    event PartyJoined(address indexed guest);

    IERC20 internal STAKING_TOKEN;
    IERC721 internal EXCLUSIVE_NFT;
    Stake internal STAKE;

    address[] internal _partyGuests;
    mapping(address => bool) public atParty;

    uint256 public constant MIN_CLAIM_AMOUNT = 0.1 ether;

    /// @param stakingTokenAddress Address of the StakingToken
    /// @param exclusiveNFTAddress Address of the ExclusiveNFT
    /// @param stakingAddress Address of the Stake contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address stakingTokenAddress,
        address exclusiveNFTAddress,
        address stakingAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        STAKING_TOKEN = IERC20(stakingTokenAddress);
        EXCLUSIVE_NFT = IERC721(exclusiveNFTAddress);
        STAKE = Stake(stakingAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("sample.main-hub", hubID);
    }

    /// @notice Get a summary of the caller's token holdings
    function getTokenSummary()
        external
        view
        returns (
            uint256 nativeTokenBalance,
            uint256 stakingTokenBalance,
            uint256 tokensStaked,
            uint256 exclusiveNFTBalance
        )
    {
        nativeTokenBalance = msg.sender.balance;
        stakingTokenBalance = STAKING_TOKEN.balanceOf(msg.sender);
        tokensStaked = STAKE.stakedBalanceOf(msg.sender);
        exclusiveNFTBalance = EXCLUSIVE_NFT.balanceOf(msg.sender);
    }

    /// @notice Claim an NFT by paying at least MIN_CLAIM_AMOUNT
    /// @dev Triggers the full transit flow through all connected hubs
    function claimNFT() external payable nonReentrant {
        if (msg.value < MIN_CLAIM_AMOUNT)
            revert InsufficientPayment(MIN_CLAIM_AMOUNT, msg.value);
        DEX(REGISTRY.addressFromName("sample.dex")).prepay{value: msg.value}(
            msg.sender
        );
        emit NFTClaimed(msg.sender, msg.value);
        _sendUserToHub(msg.sender, "sample.dex");
    }

    /// @notice Get all addresses that have completed the transit and joined the party
    function getPartyGuests() external view returns (address[] memory) {
        return _partyGuests;
    }

    /// @notice Manually attempt to join the party (requires ExclusiveNFT)
    function attemptPartyEntry() external {
        if (EXCLUSIVE_NFT.balanceOf(msg.sender) == 0) revert NFTRequired();
        if (!atParty[msg.sender]) {
            _partyGuests.push(msg.sender);
            atParty[msg.sender] = true;
            emit PartyJoined(msg.sender);
        }
    }

    /// @dev Attempt party entry on behalf of a user (called by transit hooks)
    function _attemptPartyEntryFor(address userAddress) internal {
        if (EXCLUSIVE_NFT.balanceOf(userAddress) > 0) {
            if (!atParty[userAddress]) {
                _partyGuests.push(userAddress);
                atParty[userAddress] = true;
                emit PartyJoined(userAddress);
            }
        }
    }

    /// @dev Automatic action when a user arrives via the transit system
    function _userDidEnter(address userAddress) internal override {
        _attemptPartyEntryFor(userAddress);
    }
}
