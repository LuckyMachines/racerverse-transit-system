// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {Hub} from "../../Hub.sol";
import {Railcar} from "../../Railcar.sol";

/// @title StampStation - Stamp counter hub
/// @notice Increments a stamp counter for each railcar member,
///         then routes the railcar back to the Depot.
contract StampStation is Hub {
    event Stamped(address indexed member, uint256 totalStamps);

    Railcar internal RAILCAR;

    mapping(address => uint256) public stamps;
    uint256 public totalStamps;

    constructor(
        address railcarAddress,
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {
        RAILCAR = Railcar(railcarAddress);
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("depot.stamp-station", hubID);
    }

    function _railcarDidEnter(uint256 railcarID) internal override {
        address[] memory members = RAILCAR.getMembers(railcarID);
        for (uint256 i = 0; i < members.length; i++) {
            stamps[members[i]]++;
            totalStamps++;
            emit Stamped(members[i], stamps[members[i]]);
        }
        _sendRailcarToHub(railcarID, "depot.platform");
    }
}
