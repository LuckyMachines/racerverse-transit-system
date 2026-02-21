// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Hub} from "../../Hub.sol";
import {Railcar} from "../../Railcar.sol";

/// @title Concourse - Entry point hub for the Mall Crawl example
/// @notice Users call startCrawl() to send a railcar through the full mall flow:
///         Concourse → Gallery → SoundStage → GameRoom → Concourse
contract Concourse is Hub {
    error InsufficientPayment(uint256 required, uint256 sent);

    event CrawlStarted(uint256 indexed railcarID, uint256 memberCount);
    event VIPGranted(address indexed member);

    Railcar internal RAILCAR;
    IERC20 internal MALL_CREDIT;
    IERC721 internal GALLERY;
    IERC721 internal SOUND_STAGE;

    mapping(address => bool) public isVIP;
    mapping(address => uint256) public crawlsCompleted;

    uint256 public constant ENTRY_PRICE = 0.01 ether;
    uint256 public constant CREDIT_REWARD = 100 * 1e18;

    /// @param railcarAddress Address of the Railcar contract
    /// @param galleryAddress Address of the Gallery hub (for VIP NFT checks)
    /// @param soundStageAddress Address of the SoundStage hub (for VIP NFT checks)
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address railcarAddress,
        address galleryAddress,
        address soundStageAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        RAILCAR = Railcar(railcarAddress);
        GALLERY = IERC721(galleryAddress);
        SOUND_STAGE = IERC721(soundStageAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("mall.concourse", hubID);
    }

    /// @notice Set the MallCredit token address
    /// @param mallCreditAddress Address of the MallCredit contract
    function setMallCreditAddress(address mallCreditAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        MALL_CREDIT = IERC20(mallCreditAddress);
    }

    /// @notice Start a mall crawl, sending a railcar through all storefronts
    /// @param railcarID The railcar to send through the mall
    function startCrawl(uint256 railcarID) external payable nonReentrant {
        if (msg.value < ENTRY_PRICE)
            revert InsufficientPayment(ENTRY_PRICE, msg.value);

        address[] memory members = RAILCAR.getMembers(railcarID);

        for (uint256 i = 0; i < members.length; i++) {
            MALL_CREDIT.transfer(members[i], CREDIT_REWARD);
        }

        emit CrawlStarted(railcarID, members.length);
        _sendRailcarToHub(railcarID, "mall.gallery");
    }

    /// @notice Get a shopper's stats
    /// @param shopper The address to query
    /// @return creditBalance The shopper's MallCredit balance
    /// @return crawls Number of completed crawls
    /// @return vipStatus Whether the shopper has VIP status
    function getShopperStats(address shopper)
        external
        view
        returns (
            uint256 creditBalance,
            uint256 crawls,
            bool vipStatus
        )
    {
        creditBalance = MALL_CREDIT.balanceOf(shopper);
        crawls = crawlsCompleted[shopper];
        vipStatus = isVIP[shopper];
    }

    /// @dev On return: increment crawls, grant VIP if member holds both NFTs
    function _railcarDidEnter(uint256 railcarID) internal override {
        address[] memory members = RAILCAR.getMembers(railcarID);

        for (uint256 i = 0; i < members.length; i++) {
            crawlsCompleted[members[i]]++;

            if (
                !isVIP[members[i]] &&
                GALLERY.balanceOf(members[i]) > 0 &&
                SOUND_STAGE.balanceOf(members[i]) > 0
            ) {
                isVIP[members[i]] = true;
                emit VIPGranted(members[i]);
            }
        }
    }
}
