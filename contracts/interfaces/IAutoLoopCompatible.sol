// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

/// @title IAutoLoopCompatible - Interface for AutoLoop-compatible contracts
/// @notice Copied from AutoLoop's AutoLoopCompatibleInterface.sol
/// @dev The interfaceId is computed from function selectors and is identical
///      regardless of the pragma version used to compile.
interface IAutoLoopCompatible {
    /// @notice Check whether the loop should progress
    /// @return loopIsReady True if the contract is ready for progression
    /// @return progressWithData Encoded data to pass to progressLoop
    function shouldProgressLoop()
        external
        view
        returns (bool loopIsReady, bytes memory progressWithData);

    /// @notice Execute the loop progression
    /// @param progressWithData Data returned by shouldProgressLoop
    function progressLoop(bytes calldata progressWithData) external;
}
