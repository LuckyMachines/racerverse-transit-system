// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HubRegistry} from "./HubRegistry.sol";
import {IHub} from "./interfaces/IHub.sol";

/// @title Hub - Base contract for transit system hubs
/// @notice Hubs connect to each other and route users through the transit system
contract Hub is IHub, AccessControlEnumerable, ReentrancyGuard {
    mapping(uint256 => bool) public inputAllowed;
    mapping(uint256 => bool) public inputActive;
    uint256[] internal _hubInputs;
    uint256[] internal _hubOutputs;

    bool public allowAllInputs;
    HubRegistry public REGISTRY;

    modifier onlyAuthorizedHub() {
        if (
            !allowAllInputs &&
            !inputAllowed[REGISTRY.idFromAddress(msg.sender)]
        ) revert HubNotAuthorized();
        _;
    }

    /// @param hubRegistryAddress Address of the HubRegistry contract
    /// @param hubAdmin Address to grant DEFAULT_ADMIN_ROLE
    constructor(address hubRegistryAddress, address hubAdmin) {
        REGISTRY = HubRegistry(hubRegistryAddress);
        _register();
        _grantRole(DEFAULT_ADMIN_ROLE, hubAdmin);
    }

    /// @notice Get all hub IDs that have input connections to this hub
    function hubInputs() external view returns (uint256[] memory inputs) {
        inputs = _hubInputs;
    }

    /// @notice Get all hub IDs that this hub outputs to
    function hubOutputs() external view returns (uint256[] memory outputs) {
        outputs = _hubOutputs;
    }

    // ── Hub-to-Hub communication ───────────────────────────────

    /// @notice Called by another hub to register itself as an input
    function addInput() external onlyAuthorizedHub {
        uint256 hubID = REGISTRY.idFromAddress(msg.sender);
        _hubInputs.push(hubID);
        inputActive[hubID] = true;
        emit InputAdded(hubID);
    }

    /// @notice Receive a user from an authorized input hub
    /// @param userAddress The user being transferred
    /// @dev No reentrancy guard here: transit flows legitimately re-enter
    ///      the originating hub (e.g. MainHub → DEX → ... → MainHub)
    function enterUser(address userAddress)
        external
        virtual
        onlyAuthorizedHub
    {
        uint256 senderHubId = REGISTRY.idFromAddress(msg.sender);
        if (!inputActive[senderHubId]) revert OriginHubNotInput();
        emit UserEntered(userAddress, senderHubId);
        _userWillEnter(userAddress);
        _userDidEnter(userAddress);
    }

    /// @notice Receive a railcar from an authorized input hub
    /// @param railcarID The railcar being transferred
    function enterRailcar(uint256 railcarID)
        external
        virtual
        onlyAuthorizedHub
    {
        uint256 senderHubId = REGISTRY.idFromAddress(msg.sender);
        if (!inputActive[senderHubId]) revert OriginHubNotInput();
        emit RailcarEntered(railcarID, senderHubId);
        _railcarWillEnter(railcarID);
        _railcarDidEnter(railcarID);
    }

    /// @notice Called by another hub to remove itself as an input
    /// @dev BUG FIX: Original code pushed to _hubInputs instead of removing
    function removeInput() external onlyAuthorizedHub {
        uint256 hubID = REGISTRY.idFromAddress(msg.sender);
        _removeFromArray(_hubInputs, hubID);
        inputActive[hubID] = false;
        emit InputRemoved(hubID);
    }

    // ── Admin ──────────────────────────────────────────────────

    /// @notice Toggle whether all hubs are allowed as inputs
    /// @param allowAll True to accept input from any hub
    function setAllowAllInputs(bool allowAll)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        allowAllInputs = allowAll;
        emit AllowAllInputsChanged(allowAll);
    }

    /// @notice Explicitly allow or deny a specific hub as an input
    /// @param hubID The hub ID to configure
    /// @param allowed True to allow, false to deny
    function setInputAllowed(uint256 hubID, bool allowed)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        inputAllowed[hubID] = allowed;
        emit InputAllowedChanged(hubID, allowed);
    }

    /// @notice Withdraw accumulated fees to a specified address
    /// @param to The recipient address
    function withdrawFees(address payable to)
        external
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        uint256 balance = address(this).balance;
        (bool success, ) = to.call{value: balance}("");
        if (!success) revert WithdrawFailed();
        emit FeesWithdrawn(to, balance);
    }

    /// @notice Connect this hub to one or more output hubs
    /// @param outputs Array of hub IDs to connect to
    function addHubConnections(uint256[] calldata outputs)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (!_connectionHubsValid(outputs)) revert InvalidHubIndices();
        for (uint256 i = 0; i < outputs.length; i++) {
            Hub hub = Hub(REGISTRY.hubAddress(outputs[i]));
            hub.addInput();
            _hubOutputs.push(outputs[i]);
            emit OutputAdded(outputs[i]);
        }
    }

    /// @notice Remove output connections to specified hubs
    /// @param connectedHubIDs Array of hub IDs to disconnect from
    /// @dev BUG FIX: Original code did not remove from _hubOutputs
    function removeHubConnectionsTo(uint256[] calldata connectedHubIDs)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < connectedHubIDs.length; i++) {
            Hub hub = Hub(REGISTRY.hubAddress(connectedHubIDs[i]));
            hub.removeInput();
            _removeFromArray(_hubOutputs, connectedHubIDs[i]);
            emit OutputRemoved(connectedHubIDs[i]);
        }
    }

    // ── Custom Behaviors (override in subclasses) ──────────────

    function _userWillEnter(address userAddress) internal virtual {}
    function _userDidEnter(address userAddress) internal virtual {}
    function _userWillExit(address userAddress) internal virtual {}
    function _userDidExit(address userAddress) internal virtual {}
    function _railcarWillEnter(uint256 railcarID) internal virtual {}
    function _railcarDidEnter(uint256 railcarID) internal virtual {}
    function _railcarWillExit(uint256 railcarID) internal virtual {}
    function _railcarDidExit(uint256 railcarID) internal virtual {}

    // ── Internal ───────────────────────────────────────────────

    /// @dev Send a user to another hub by ID
    function _sendUserToHub(address userAddress, uint256 hubID) internal {
        _userWillExit(userAddress);
        emit UserExited(userAddress, hubID);
        Hub(REGISTRY.hubAddress(hubID)).enterUser(userAddress);
        _userDidExit(userAddress);
    }

    /// @dev Send a user to another hub by name
    function _sendUserToHub(address userAddress, string memory _hubName)
        internal
    {
        uint256 hubID = REGISTRY.idFromName(_hubName);
        _userWillExit(userAddress);
        emit UserExited(userAddress, hubID);
        Hub(REGISTRY.addressFromName(_hubName)).enterUser(userAddress);
        _userDidExit(userAddress);
    }

    /// @dev Send a railcar to another hub by ID
    function _sendRailcarToHub(uint256 railcarID, uint256 hubID) internal {
        _railcarWillExit(railcarID);
        emit RailcarExited(railcarID, hubID);
        Hub(REGISTRY.hubAddress(hubID)).enterRailcar(railcarID);
        _railcarDidExit(railcarID);
    }

    /// @dev Send a railcar to another hub by name
    function _sendRailcarToHub(uint256 railcarID, string memory _hubName)
        internal
    {
        uint256 hubID = REGISTRY.idFromName(_hubName);
        _railcarWillExit(railcarID);
        emit RailcarExited(railcarID, hubID);
        Hub(REGISTRY.addressFromName(_hubName)).enterRailcar(railcarID);
        _railcarDidExit(railcarID);
    }

    function _register() internal {
        if (!REGISTRY.hubCanRegister(address(this)))
            revert RegistrationFailed();
        REGISTRY.register();
    }

    function _connectionHubsValid(uint256[] calldata outputs)
        internal
        view
        returns (bool isValid)
    {
        isValid = true;
        for (uint256 i = 0; i < outputs.length; i++) {
            if (REGISTRY.hubAddress(outputs[i]) == address(0)) {
                isValid = false;
                break;
            }
        }
    }

    function _isAllowedInput(uint256 hubID) internal view returns (bool) {
        Hub hubToCheck = Hub(REGISTRY.hubAddress(hubID));
        return hubToCheck.allowAllInputs() ||
            hubToCheck.inputAllowed(_hubID());
    }

    function _hubID() internal view returns (uint256) {
        return REGISTRY.idFromAddress(address(this));
    }

    /// @dev Swap-and-pop removal from an unordered array
    /// @param arr The storage array to modify
    /// @param value The value to remove (first occurrence)
    function _removeFromArray(uint256[] storage arr, uint256 value) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                return;
            }
        }
    }
}
