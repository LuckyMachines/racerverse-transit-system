// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

/// @title IHub - Interface for Hub contracts
/// @notice Defines the external API, custom errors, and events for Hub
interface IHub {
    // Errors
    error HubNotAuthorized();
    error OriginHubNotInput();
    error InvalidHubIndices();
    error RegistrationFailed();

    // Events
    event InputAdded(uint256 indexed hubId);
    event InputRemoved(uint256 indexed hubId);
    event OutputAdded(uint256 indexed hubId);
    event OutputRemoved(uint256 indexed hubId);
    event UserEntered(address indexed user, uint256 indexed fromHubId);
    event UserExited(address indexed user, uint256 indexed toHubId);
    event RailcarEntered(uint256 indexed railcarId, uint256 indexed fromHubId);
    event RailcarExited(uint256 indexed railcarId, uint256 indexed toHubId);
    event AllowAllInputsChanged(bool allowed);
    event InputAllowedChanged(uint256 indexed hubId, bool allowed);

    // Functions
    function hubInputs() external view returns (uint256[] memory);
    function hubOutputs() external view returns (uint256[] memory);
    function addInput() external;
    function enterUser(address userAddress) external;
    function enterRailcar(uint256 railcarID) external;
    function removeInput() external;
    function setAllowAllInputs(bool allowAll) external;
    function setInputAllowed(uint256 hubID, bool allowed) external;
    function addHubConnections(uint256[] calldata outputs) external;
    function removeHubConnectionsTo(uint256[] calldata connectedHubIDs) external;
}
