// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Hub} from "./Hub.sol";
import {IAutoLoopCompatible} from "./interfaces/IAutoLoopCompatible.sol";

/// @title AutoLoopHub - Base contract for AutoLoop-compatible hubs
/// @notice Extends Hub with AutoLoop integration for time-based automation.
///         Subclasses override _shouldProgressLoop() and _progressLoop().
abstract contract AutoLoopHub is Hub, IAutoLoopCompatible {
    uint256 internal _loopID = 1;

    constructor(
        address hubRegistryAddress,
        address hubAdmin
    ) Hub(hubRegistryAddress, hubAdmin) {}

    // ── IAutoLoopCompatible ────────────────────────────────────

    /// @inheritdoc IAutoLoopCompatible
    function shouldProgressLoop()
        external
        view
        override
        returns (bool loopIsReady, bytes memory progressWithData)
    {
        return _shouldProgressLoop();
    }

    /// @inheritdoc IAutoLoopCompatible
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
            interfaceId == type(IAutoLoopCompatible).interfaceId ||
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
