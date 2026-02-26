// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.34;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Hub} from "./Hub.sol";
import {AutoLoopCompatibleInterface} from "@luckymachines/autoloop/src/AutoLoopCompatibleInterface.sol";

/// @title AutoLoopHub - Base contract for AutoLoop-compatible hubs
/// @notice Extends Hub with AutoLoop integration for time-based automation.
///         Subclasses override _shouldProgressLoop() and _progressLoop().
abstract contract AutoLoopHub is Hub, AutoLoopCompatibleInterface {
    uint256 internal _loopID = 1;

    constructor(
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {}

    // ── IAutoLoopCompatible ────────────────────────────────────

    /// @inheritdoc AutoLoopCompatibleInterface
    function shouldProgressLoop()
        external
        view
        override
        returns (bool loopIsReady, bytes memory progressWithData)
    {
        return _shouldProgressLoop();
    }

    /// @inheritdoc AutoLoopCompatibleInterface
    function progressLoop(bytes calldata progressWithData) external override {
        _progressLoop(progressWithData);
    }

    // ── ERC165 ─────────────────────────────────────────────────

    /// @dev Adds IAutoLoopCompatible to supported interfaces
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlEnumerable)
        returns (bool)
    {
        return
            interfaceId == type(AutoLoopCompatibleInterface).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ── Virtual hooks for subclasses ───────────────────────────

    /// @dev Override to define when the loop should progress
    function _shouldProgressLoop()
        internal
        view
        virtual
        returns (bool loopIsReady, bytes memory progressWithData);

    /// @dev Override to define what happens when the loop progresses
    function _progressLoop(bytes memory progressWithData) internal virtual;
}
