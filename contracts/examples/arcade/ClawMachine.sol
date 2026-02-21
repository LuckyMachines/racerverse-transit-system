// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hub} from "../../Hub.sol";

/// @title ClawMachine - ERC721 plushie NFT minter hub for the Arcade Strip example
/// @notice Takes 10 PrizeTickets via transferFrom, mints a plushie NFT with random type and rarity
contract ClawMachine is ERC721, Hub {
    event PlushieWon(address indexed user, uint256 indexed tokenId, PlushieType plushieType, Rarity rarity);

    enum PlushieType { Bear, Bunny, Dragon, Unicorn }
    enum Rarity { Common, Uncommon, Rare, Legendary }

    struct PlushieStats {
        PlushieType plushieType;
        Rarity rarity;
    }

    IERC20 private PRIZE_TICKET;
    uint256 private _nextTokenId;

    uint256 public constant TICKET_COST = 10 * 1e18;

    /// @notice Token ID → plushie stats
    mapping(uint256 => PlushieStats) public plushieStats;

    /// @param hubRegistryAddress Address of the HubRegistry
    /// @param hubAdmin Address to grant admin role
    constructor(
        address hubRegistryAddress,
        address hubAdmin
    ) ERC721("ArcadePlushie", "PLUSH") Hub(hubRegistryAddress, hubAdmin) {
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("arcade.claw-machine", hubID);
    }

    /// @notice Set the prize ticket address
    /// @param prizeTicketAddress Address of the PrizeTicket contract
    function setPrizeTicketAddress(address prizeTicketAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        PRIZE_TICKET = IERC20(prizeTicketAddress);
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

    /// @dev Take PrizeTickets, mint a plushie NFT, route to PrizeCounter
    function _userDidEnter(address userAddress) internal override {
        // Take 10 PrizeTickets from user
        PRIZE_TICKET.transferFrom(userAddress, address(this), TICKET_COST);

        // Generate random plushie type and rarity
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(block.prevrandao, block.timestamp, userAddress)
            )
        );

        PlushieType plushieType = PlushieType(seed % 4);
        Rarity rarity = Rarity((seed >> 8) % 4);

        uint256 tokenId = _nextTokenId++;
        _safeMint(userAddress, tokenId);

        plushieStats[tokenId] = PlushieStats(plushieType, rarity);

        emit PlushieWon(userAddress, tokenId, plushieType, rarity);
        _sendUserToHub(userAddress, "arcade.prize-counter");
    }
}
