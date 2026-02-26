// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Hub} from "../../Hub.sol";
import {Railcar} from "../../Railcar.sol";

/// @title Gallery - Generative art store hub for the Mall Crawl example
/// @notice Mints an art NFT with random Style + Palette for each railcar member
contract Gallery is ERC721, Hub {
    enum ArtStyle { Abstract, Geometric, Surreal, Minimalist }
    enum Palette { Warm, Cool, Monochrome, Neon }

    struct ArtStats {
        ArtStyle style;
        Palette palette;
    }

    Railcar internal RAILCAR;
    uint256 private _nextTokenId;

    /// @notice Token ID → art stats
    mapping(uint256 => ArtStats) public artStats;

    /// @param railcarAddress Address of the Railcar contract
    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address railcarAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) ERC721("MallArt", "MART") Hub(hubRegistryAddress, hubAdmin) {
        RAILCAR = Railcar(railcarAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("mall.gallery", hubID);
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

    /// @dev Mint art NFT per member, then route railcar to SoundStage
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

            ArtStyle style = ArtStyle(seed % 4);
            Palette palette = Palette((seed >> 8) % 4);

            uint256 tokenId = _nextTokenId++;
            _safeMint(members[i], tokenId);
            artStats[tokenId] = ArtStats(style, palette);
        }

        _sendRailcarToHub(railcarID, "mall.sound-stage");
    }
}
