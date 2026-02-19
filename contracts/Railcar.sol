// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRailcar} from "./interfaces/IRailcar.sol";

/// @title Railcar - Group transit management
/// @notice Members can join a group railcar, or a Hub can create one with specific addresses
contract Railcar is IRailcar, AccessControlEnumerable, ReentrancyGuard {
    bytes32 public constant HUB_ROLE = keccak256("HUB_ROLE");

    /// @notice Railcar ID → member addresses
    mapping(uint256 => address[]) internal _members;
    /// @notice Railcar ID → maximum members allowed
    mapping(uint256 => uint256) public memberLimit;
    /// @notice Railcar ID → creator/owner address
    mapping(uint256 => address) public owner;

    /// @notice Member address → array of railcar IDs they belong to
    mapping(address => uint256[]) public railcars;
    /// @notice Creator address → array of railcar IDs they created
    mapping(address => uint256[]) public ownedRailcars;

    /// @notice Railcar ID → member address → membership flag
    mapping(uint256 => mapping(address => bool)) public isMember;

    uint256 public totalRailcars;
    uint256 public creationFee;

    /// @param adminAddress The address to grant DEFAULT_ADMIN_ROLE
    constructor(address adminAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
    }

    /// @notice Check if an address can create a railcar
    /// @param _address The address to check
    /// @return canCreate True if the address can create
    function canCreateRailcar(address _address)
        external
        view
        returns (bool canCreate)
    {
        canCreate = _canCreate(_address);
    }

    /// @notice Create a new railcar with a member limit
    /// @param limit Maximum number of members
    function createRailcar(uint256 limit) external payable nonReentrant {
        if (!_canCreate(msg.sender)) revert NotQualifiedToCreate();
        if (msg.value < creationFee)
            revert InsufficientCreationFee(creationFee, msg.value);
        _createRailcar(msg.sender, limit);
    }

    /// @notice Get railcar IDs created by the caller
    function getCreatedRailcars() external view returns (uint256[] memory) {
        return ownedRailcars[msg.sender];
    }

    /// @notice Get railcar IDs the caller is a member of
    function getRailcars() external view returns (uint256[] memory) {
        return railcars[msg.sender];
    }

    /// @notice Get all members of a railcar
    /// @param railcarID The railcar ID to query
    /// @return Array of member addresses
    function getMembers(uint256 railcarID)
        external
        view
        returns (address[] memory)
    {
        if (railcarID == 0 || railcarID > totalRailcars)
            revert InvalidRailcarId(railcarID);
        return _members[railcarID];
    }

    /// @notice Join an existing railcar
    /// @param railcarID The railcar to join
    function joinRailcar(uint256 railcarID) external {
        if (railcarID == 0 || railcarID > totalRailcars)
            revert InvalidRailcarId(railcarID);
        if (isMember[railcarID][msg.sender])
            revert AlreadyMember(railcarID, msg.sender);
        if (_members[railcarID].length >= memberLimit[railcarID])
            revert RailcarFull(railcarID);
        _members[railcarID].push(msg.sender);
        railcars[msg.sender].push(railcarID);
        isMember[railcarID][msg.sender] = true;
        emit MemberJoined(railcarID, msg.sender);
    }

    /// @notice Create a railcar from a hub with pre-set members
    /// @param _memberAddresses The initial members
    /// @return railcarID The ID of the created railcar
    function createRailcarFromHub(address[] calldata _memberAddresses)
        external
        payable
        onlyRole(HUB_ROLE)
        nonReentrant
        returns (uint256 railcarID)
    {
        if (!_canCreate(msg.sender)) revert NotQualifiedToCreate();
        if (msg.value < creationFee)
            revert InsufficientCreationFee(creationFee, msg.value);
        _createRailcar(msg.sender, _memberAddresses.length, _memberAddresses);
        railcarID = totalRailcars;
    }

    // ── Admin ──────────────────────────────────────────────────

    /// @notice Update the creation fee
    /// @param fee The new fee in wei
    function setCreationFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldFee = creationFee;
        creationFee = fee;
        emit CreationFeeUpdated(oldFee, fee);
    }

    // ── Internal ───────────────────────────────────────────────

    function _createRailcar(address _creatorAddress, uint256 limit) internal {
        totalRailcars++;
        memberLimit[totalRailcars] = limit;
        owner[totalRailcars] = _creatorAddress;
        ownedRailcars[_creatorAddress].push(totalRailcars);
        emit RailcarCreated(totalRailcars, _creatorAddress, limit);
    }

    function _createRailcar(
        address _creatorAddress,
        uint256 limit,
        address[] calldata _memberAddresses
    ) internal {
        _createRailcar(_creatorAddress, limit);
        uint256 validMembers = limit < _memberAddresses.length
            ? limit
            : _memberAddresses.length;
        for (uint256 i = 0; i < validMembers; i++) {
            if (!isMember[totalRailcars][_memberAddresses[i]]) {
                _members[totalRailcars].push(_memberAddresses[i]);
                railcars[_memberAddresses[i]].push(totalRailcars);
                isMember[totalRailcars][_memberAddresses[i]] = true;
                emit MemberJoined(totalRailcars, _memberAddresses[i]);
            }
        }
    }

    function _canCreate(address _address)
        internal
        view
        virtual
        returns (bool canCreate)
    {
        canCreate = _address != address(0);
    }
}
