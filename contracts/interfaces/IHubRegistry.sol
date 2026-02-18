// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

/// @title IHubRegistry - Interface for the Hub Registry
/// @notice Defines the external API, custom errors, and events for HubRegistry
interface IHubRegistry {
    // Errors
    error HubNotQualified();
    error InsufficientRegistrationFee(uint256 required, uint256 sent);
    error InsufficientNamingFee(uint256 required, uint256 sent);
    error InvalidHubName();
    error HubIdMismatch();
    error NameUnavailable(string name);
    error StartingIdOutOfBounds(uint256 startingID, uint256 total);
    error MaxIdLessThanStartingId();
    error WithdrawFailed();

    // Events
    event HubRegistered(address indexed hub, uint256 indexed hubId);
    event HubNamed(uint256 indexed hubId, string name);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event NamingFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // Functions
    function hubCanRegister(address hubAddress) external view returns (bool);
    function nameIsAvailable(string calldata hubName) external view returns (bool);
    function register() external payable;
    function setName(string calldata hubName, uint256 hubID) external payable;
    function hubAddressesInRange(uint256 startingID, uint256 maxID) external view returns (address[] memory);
    function setRegistrationFee(uint256 fee) external;
    function setNamingFee(uint256 fee) external;
    function withdrawFees(address payable to) external;
}
