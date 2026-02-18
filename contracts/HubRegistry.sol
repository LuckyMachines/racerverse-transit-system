// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ValidCharacters} from "./ValidCharacters.sol";
import {IHubRegistry} from "./interfaces/IHubRegistry.sol";

/// @title HubRegistry - Central registry for all transit hubs
/// @notice Manages hub registration, naming, and fee collection
contract HubRegistry is IHubRegistry, AccessControlEnumerable, ReentrancyGuard {
    bytes32 public constant HUB_ROLE = keccak256("HUB_ROLE");

    /// @notice Hub name → address
    mapping(string => address) public addressFromName;
    /// @notice Hub name → ID
    mapping(string => uint256) public idFromName;

    /// @notice Hub ID → name
    mapping(uint256 => string) public hubName;
    /// @notice Hub ID → address
    mapping(uint256 => address) public hubAddress;

    /// @notice Hub address → registered flag
    mapping(address => bool) public isRegistered;
    /// @notice Hub address → ID
    mapping(address => uint256) public idFromAddress;

    uint256 public totalRegistrations;
    uint256 public registrationFee;
    uint256 public namingFee;

    /// @param adminAddress The address to grant DEFAULT_ADMIN_ROLE
    constructor(address adminAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
    }

    /// @notice Check if a hub address is eligible for registration
    /// @param _hubAddress The address to check
    /// @return canRegister True if the hub can register
    function hubCanRegister(address _hubAddress)
        external
        view
        returns (bool canRegister)
    {
        canRegister = _canRegister(_hubAddress);
    }

    /// @notice Check if a hub name is available
    /// @param _hubName The name to check
    /// @return available True if the name is not taken
    function nameIsAvailable(string calldata _hubName)
        external
        view
        returns (bool available)
    {
        available = idFromName[_hubName] == 0;
    }

    /// @notice Register the calling hub
    /// @dev Called directly from a hub contract
    function register() external payable nonReentrant {
        if (!_canRegister(msg.sender)) revert HubNotQualified();
        if (msg.value < registrationFee)
            revert InsufficientRegistrationFee(registrationFee, msg.value);
        _register(msg.sender);
    }

    /// @notice Set a name for a registered hub
    /// @param _hubName The desired name (must match [a-z0-9._-]+)
    /// @param hubID The hub's ID
    function setName(string calldata _hubName, uint256 hubID)
        external
        payable
        onlyRole(HUB_ROLE)
    {
        if (!ValidCharacters.matches(_hubName)) revert InvalidHubName();
        if (msg.value < namingFee)
            revert InsufficientNamingFee(namingFee, msg.value);
        if (msg.sender != hubAddress[hubID]) revert HubIdMismatch();
        if (idFromName[_hubName] != 0) revert NameUnavailable(_hubName);
        addressFromName[_hubName] = hubAddress[hubID];
        idFromName[_hubName] = hubID;
        hubName[hubID] = _hubName;
        emit HubNamed(hubID, _hubName);
    }

    /// @notice Get hub addresses within a range of IDs
    /// @param startingID The first hub ID (inclusive)
    /// @param maxID The last hub ID (inclusive)
    /// @return Array of hub addresses
    function hubAddressesInRange(uint256 startingID, uint256 maxID)
        external
        view
        returns (address[] memory)
    {
        if (startingID > totalRegistrations)
            revert StartingIdOutOfBounds(startingID, totalRegistrations);
        if (maxID < startingID) revert MaxIdLessThanStartingId();
        uint256 actualMaxID = maxID > totalRegistrations ? totalRegistrations : maxID;
        uint256 size = actualMaxID - startingID + 1;
        address[] memory hubs = new address[](size);
        // BUG FIX: was `startingID - i` which underflows; corrected to `i - startingID`
        for (uint256 i = startingID; i < startingID + size; i++) {
            uint256 index = i - startingID;
            hubs[index] = hubAddress[i];
        }
        return hubs;
    }

    // ── Admin ──────────────────────────────────────────────────

    /// @notice Update the registration fee
    /// @param fee The new fee in wei
    function setRegistrationFee(uint256 fee)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        uint256 oldFee = registrationFee;
        registrationFee = fee;
        emit RegistrationFeeUpdated(oldFee, fee);
    }

    /// @notice Update the naming fee
    /// @param fee The new fee in wei
    function setNamingFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldFee = namingFee;
        // BUG FIX: was writing to `registrationFee`; corrected to `namingFee`
        namingFee = fee;
        emit NamingFeeUpdated(oldFee, fee);
    }

    /// @notice Withdraw accumulated fees to a specified address
    /// @param to The recipient address
    function withdrawFees(address payable to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        uint256 balance = address(this).balance;
        (bool success, ) = to.call{value: balance}("");
        if (!success) revert WithdrawFailed();
        emit FeesWithdrawn(to, balance);
    }

    // ── Internal ───────────────────────────────────────────────

    function _register(address _hubAddress) internal {
        if (!isRegistered[_hubAddress]) {
            isRegistered[_hubAddress] = true;
            uint256 newID = totalRegistrations + 1;
            totalRegistrations = newID;
            hubAddress[newID] = _hubAddress;
            idFromAddress[_hubAddress] = newID;
            _grantRole(HUB_ROLE, _hubAddress);
            emit HubRegistered(_hubAddress, newID);
        }
    }

    function _canRegister(address _hubAddress)
        internal
        view
        virtual
        returns (bool canRegister)
    {
        canRegister = _hubAddress != address(0);
    }
}
