// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import {StakingToken} from "./StakingToken.sol";
import {Hub} from "../../Hub.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DEX - Sample exchange that swaps native tokens for StakingToken at 1:1
/// @notice Part of the NFT+DeFi transit example
contract DEX is Hub {
    error InsufficientLiquidity(uint256 available, uint256 requested);

    event Exchanged(address indexed user, uint256 amount);
    event Prepaid(address indexed user, uint256 amount);

    StakingToken private STAKING_TOKEN;

    mapping(address => uint256) public prepaidBalance;

    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(address hubRegistryAddress, address hubAdmin)
        Hub(hubRegistryAddress, hubAdmin)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("sample.dex", hubID);
    }

    /// @notice Set the staking token address (after it has been minted)
    /// @param stakingTokenAddress Address of the StakingToken contract
    function setStakingTokenAddress(address stakingTokenAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        STAKING_TOKEN = StakingToken(stakingTokenAddress);
    }

    /// @notice Exchange native tokens for StakingToken at 1:1
    function exchange() external payable nonReentrant {
        uint256 available = STAKING_TOKEN.balanceOf(address(this));
        if (available < msg.value)
            revert InsufficientLiquidity(available, msg.value);
        STAKING_TOKEN.transfer(msg.sender, msg.value);
        emit Exchanged(msg.sender, msg.value);
    }

    /// @notice Prepay native tokens on behalf of a user for later exchange
    /// @param user The user to credit
    function prepay(address user) external payable {
        prepaidBalance[user] += msg.value;
        emit Prepaid(user, msg.value);
    }

    /// @dev Automatic action when a user arrives via the transit system
    function _userDidEnter(address userAddress) internal override {
        STAKING_TOKEN.transfer(userAddress, prepaidBalance[userAddress]);
        prepaidBalance[userAddress] = 0;
        _sendUserToHub(userAddress, "sample.stake");
    }
}
