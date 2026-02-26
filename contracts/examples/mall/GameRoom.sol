// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hub} from "../../Hub.sol";
import {Railcar} from "../../Railcar.sol";

/// @title GameRoom - Store credit game hub for the Mall Crawl example
/// @notice Awards random MallCredit (10/25/50/100) to each railcar member
/// @dev Uses block.prevrandao + block.timestamp for randomness — NOT production-safe
contract GameRoom is Hub {
    event PrizeWon(
        address indexed member,
        PrizeLevel level,
        uint256 credits
    );

    enum PrizeLevel { Bronze, Silver, Gold, Platinum }

    Railcar internal RAILCAR;
    IERC20 internal MALL_CREDIT;

    mapping(address => uint256) public lastCreditsWon;
    uint256 public totalGamesPlayed;

    /// @param railcarAddress Address of the Railcar contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address railcarAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        RAILCAR = Railcar(railcarAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("mall.game-room", hubID);
    }

    /// @notice Set the MallCredit token address
    /// @param mallCreditAddress Address of the MallCredit contract
    function setMallCreditAddress(address mallCreditAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        MALL_CREDIT = IERC20(mallCreditAddress);
    }

    /// @dev Roll random prize per member, award credits, route railcar to Concourse
    function _railcarDidEnter(uint256 railcarID) internal override {
        address[] memory members = RAILCAR.getMembers(railcarID);

        for (uint256 i = 0; i < members.length; i++) {
            uint256 seed = uint256(
                keccak256(
                    abi.encodePacked(
                        block.prevrandao,
                        block.timestamp,
                        members[i]
                    )
                )
            );

            uint256 roll = seed % 100;
            PrizeLevel level;
            uint256 credits;

            if (roll < 5) {
                // 5% chance: Platinum — 100 MallCredit
                level = PrizeLevel.Platinum;
                credits = 100 * 1e18;
            } else if (roll < 20) {
                // 15% chance: Gold — 50 MallCredit
                level = PrizeLevel.Gold;
                credits = 50 * 1e18;
            } else if (roll < 50) {
                // 30% chance: Silver — 25 MallCredit
                level = PrizeLevel.Silver;
                credits = 25 * 1e18;
            } else {
                // 50% chance: Bronze — 10 MallCredit
                level = PrizeLevel.Bronze;
                credits = 10 * 1e18;
            }

            MALL_CREDIT.transfer(members[i], credits);
            lastCreditsWon[members[i]] = credits;
            totalGamesPlayed++;

            emit PrizeWon(members[i], level, credits);
        }

        _sendRailcarToHub(railcarID, "mall.concourse");
    }
}
