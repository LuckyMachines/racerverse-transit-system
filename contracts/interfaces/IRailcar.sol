// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

/// @title IRailcar - Interface for Railcar contracts
/// @notice Defines the external API, custom errors, and events for Railcar
interface IRailcar {
    // Errors
    error NotQualifiedToCreate();
    error InsufficientCreationFee(uint256 required, uint256 sent);
    error RailcarFull(uint256 railcarId);
    error AlreadyMember(uint256 railcarId, address member);
    error InvalidRailcarId(uint256 railcarId);

    // Events
    event RailcarCreated(uint256 indexed railcarId, address indexed creator, uint256 memberLimit);
    event MemberJoined(uint256 indexed railcarId, address indexed member);
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);

    // Functions
    function canCreateRailcar(address addr) external view returns (bool);
    function createRailcar(uint256 limit) external payable;
    function createRailcarFromHub(address[] calldata members) external payable returns (uint256);
    function joinRailcar(uint256 railcarID) external;
    function getMembers(uint256 railcarID) external view returns (address[] memory);
    function getCreatedRailcars() external view returns (uint256[] memory);
    function getRailcars() external view returns (uint256[] memory);
    function setCreationFee(uint256 fee) external;
}
