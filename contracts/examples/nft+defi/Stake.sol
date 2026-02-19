// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {StakingToken} from "./StakingToken.sol";
import {Hub} from "../../Hub.sol";

/// @title Stake - Sample staking contract for StakingToken
/// @notice Part of the NFT+DeFi transit example
contract Stake is Hub {
    error InsufficientAllowance();

    event TokensStaked(address indexed staker, uint256 amount);

    StakingToken private STAKING_TOKEN;

    /// @notice Staker address → staked balance
    mapping(address => uint256) public stakedBalance;

    /// @param stakingTokenAddress Address of the StakingToken contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address stakingTokenAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        STAKING_TOKEN = StakingToken(stakingTokenAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("sample.stake", hubID);
    }

    /// @notice Stake tokens (caller must have approved this contract)
    /// @param amount Amount of StakingToken to stake
    function stakeTokens(uint256 amount) public {
        STAKING_TOKEN.transferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        emit TokensStaked(msg.sender, amount);
    }

    /// @notice Stake tokens on behalf of another address (internal only)
    /// @dev Security fix: changed from public to internal to prevent
    ///      anyone force-staking on behalf of others
    /// @param staker The address to stake for
    /// @param amount Amount to stake
    function stakeTokensFor(address staker, uint256 amount) internal {
        STAKING_TOKEN.transferFrom(staker, address(this), amount);
        stakedBalance[staker] += amount;
        emit TokensStaked(staker, amount);
    }

    /// @notice Get the caller's staked balance
    function getBalance() external view returns (uint256 balance) {
        balance = stakedBalance[msg.sender];
    }

    /// @notice Get any address's staked balance
    /// @param stakerAddress The address to query
    function stakedBalanceOf(address stakerAddress)
        external
        view
        returns (uint256 balance)
    {
        balance = stakedBalance[stakerAddress];
    }

    /// @dev Automatic action when a user arrives via the transit system
    function _userDidEnter(address userAddress) internal override {
        stakeTokensFor(userAddress, 0.01 ether);
        _sendUserToHub(userAddress, "sample.exclusive-nft");
    }
}
