// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hub} from "../../Hub.sol";
import {Railcar} from "../../Railcar.sol";

/// @title SoundStage - Music NFT store hub for the Mall Crawl example
/// @notice Takes 20 MallCredit per member, mints a music NFT with random Genre + BPM
contract SoundStage is ERC721, Hub {
    enum Genre { Electronic, Jazz, Classical, HipHop }

    struct MusicStats {
        Genre genre;
        uint8 bpm;
    }

    Railcar internal RAILCAR;
    IERC20 internal MALL_CREDIT;
    uint256 private _nextTokenId;

    uint256 public constant MUSIC_COST = 20 * 1e18;

    /// @notice Token ID → music stats
    mapping(uint256 => MusicStats) public musicStats;

    /// @param railcarAddress Address of the Railcar contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address railcarAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) ERC721("MallMusic", "MMUS") Hub(hubRegistryAddress, hubAdmin) {
        RAILCAR = Railcar(railcarAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("mall.sound-stage", hubID);
    }

    /// @notice Set the MallCredit token address
    /// @param mallCreditAddress Address of the MallCredit contract
    function setMallCreditAddress(address mallCreditAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        MALL_CREDIT = IERC20(mallCreditAddress);
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

    /// @dev Take MallCredit, mint music NFT per member, route railcar to GameRoom
    function _railcarDidEnter(uint256 railcarID) internal override {
        address[] memory members = RAILCAR.getMembers(railcarID);

        for (uint256 i = 0; i < members.length; i++) {
            MALL_CREDIT.transferFrom(members[i], address(this), MUSIC_COST);

            uint256 seed = uint256(
                keccak256(
                    abi.encodePacked(
                        block.prevrandao,
                        block.timestamp,
                        members[i]
                    )
                )
            );

            Genre genre = Genre(seed % 4);
            uint8 bpm = uint8(60 + (seed >> 8) % 121);

            uint256 tokenId = _nextTokenId++;
            _safeMint(members[i], tokenId);
            musicStats[tokenId] = MusicStats(genre, bpm);
        }

        _sendRailcarToHub(railcarID, "mall.game-room");
    }
}
