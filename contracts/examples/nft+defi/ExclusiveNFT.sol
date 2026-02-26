// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Stake} from "./Stake.sol";
import {Hub} from "../../Hub.sol";

/// @title ExclusiveNFT - ERC721 token mintable only by stakers
/// @notice Requires a minimum staked balance of 0.01 StakingToken to mint
/// @dev Removed Counters (deleted in OZ v5) and Ownable (unused)
contract ExclusiveNFT is ERC721, Hub {
    error MinimumStakingNotMet(address user, uint256 required, uint256 actual);

    event NFTMinted(address indexed to, uint256 indexed tokenId);

    Stake private STAKE;
    uint256 private _nextTokenId;

    uint256 public constant STAKED_BALANCE_REQUIRED = 0.01 ether;

    /// @param stakingAddress Address of the Stake contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address stakingAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) ERC721("ExclusiveNFT", "XNFT") Hub(hubRegistryAddress, hubAdmin) {
        STAKE = Stake(stakingAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("sample.exclusive-nft", hubID);
    }

    /// @notice Mint an ExclusiveNFT (caller must have sufficient staked balance)
    function mint() external {
        uint256 staked = STAKE.stakedBalanceOf(msg.sender);
        if (staked < STAKED_BALANCE_REQUIRED)
            revert MinimumStakingNotMet(msg.sender, STAKED_BALANCE_REQUIRED, staked);
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        emit NFTMinted(msg.sender, tokenId);
    }

    /// @dev Mint on behalf of a user (called internally by transit hooks)
    function _mintFor(address userAddress) internal {
        uint256 staked = STAKE.stakedBalanceOf(userAddress);
        if (staked < STAKED_BALANCE_REQUIRED)
            revert MinimumStakingNotMet(userAddress, STAKED_BALANCE_REQUIRED, staked);
        uint256 tokenId = _nextTokenId++;
        _safeMint(userAddress, tokenId);
        emit NFTMinted(userAddress, tokenId);
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

    /// @dev Automatic action when a user arrives via the transit system
    function _userDidEnter(address userAddress) internal override {
        _mintFor(userAddress);
        _sendUserToHub(userAddress, "sample.main-hub");
    }
}
