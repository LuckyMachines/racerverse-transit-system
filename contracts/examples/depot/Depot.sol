// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.33;

import {AutoLoopHub} from "../../AutoLoopHub.sol";
import {Railcar} from "../../Railcar.sol";

/// @title Depot - AutoLoop-enabled queue and dispatch hub
/// @notice Users enter a queue; an AutoLoop worker auto-dispatches them
///         as a railcar through connected hubs on a timer.
///         Flow: Depot → StampStation → Depot
contract Depot is AutoLoopHub {
    error InsufficientPayment(uint256 required, uint256 sent);
    error AlreadyInQueue(address user);

    event QueueEntered(address indexed user);
    event Dispatched(uint256 indexed railcarID, uint256 memberCount);
    event TripCompleted(address indexed member, uint256 totalTrips);

    Railcar internal RAILCAR;

    address[] public queue;
    mapping(address => bool) public inQueue;
    mapping(address => uint256) public tripsCompleted;

    uint256 public interval;
    uint256 public lastDispatch;
    uint256 public totalDispatches;

    uint256 public constant ENTRY_PRICE = 0.005 ether;

    constructor(
        address railcarAddress,
        uint256 _interval,
        address hubRegistryAddress,
        address hubAdmin
    ) AutoLoopHub(hubRegistryAddress, hubAdmin) {
        RAILCAR = Railcar(railcarAddress);
        interval = _interval;
        uint256 hubID = REGISTRY.idFromAddress(address(this));
        REGISTRY.setName("depot.platform", hubID);
    }

    // ── Public entry ───────────────────────────────────────────

    /// @notice Join the dispatch queue
    function enterQueue() external payable nonReentrant {
        if (msg.value < ENTRY_PRICE)
            revert InsufficientPayment(ENTRY_PRICE, msg.value);
        if (inQueue[msg.sender]) revert AlreadyInQueue(msg.sender);

        queue.push(msg.sender);
        inQueue[msg.sender] = true;
        emit QueueEntered(msg.sender);
    }

    /// @notice View the current queue
    function getQueue() external view returns (address[] memory) {
        return queue;
    }

    // ── AutoLoop hooks ─────────────────────────────────────────

    /// @dev Ready when queue is non-empty and interval has elapsed
    function _shouldProgressLoop()
        internal
        view
        override
        returns (bool loopIsReady, bytes memory progressWithData)
    {
        loopIsReady =
            queue.length > 0 &&
            (block.timestamp - lastDispatch) >= interval;
        progressWithData = abi.encode(_loopID);
    }

    /// @dev Re-check conditions, then dispatch
    function _progressLoop(bytes memory progressWithData) internal override {
        uint256 expectedLoopID = abi.decode(progressWithData, (uint256));
        require(expectedLoopID == _loopID, "Depot: stale loopID");
        require(queue.length > 0, "Depot: empty queue");
        require(
            (block.timestamp - lastDispatch) >= interval,
            "Depot: interval not elapsed"
        );
        _dispatch();
    }

    // ── Internal dispatch ──────────────────────────────────────

    function _dispatch() internal {
        // Snapshot queue into calldata-compatible memory array
        address[] memory members = queue;

        // Clear queue state
        for (uint256 i = 0; i < members.length; i++) {
            inQueue[members[i]] = false;
        }
        delete queue;

        // Create railcar with queued members
        uint256 railcarID = RAILCAR.createRailcarFromHub(members);

        lastDispatch = block.timestamp;
        _loopID++;
        totalDispatches++;

        emit Dispatched(railcarID, members.length);

        // Send railcar to stamp station
        _sendRailcarToHub(railcarID, "depot.stamp-station");
    }

    // ── Hub hook: railcar returns ──────────────────────────────

    function _railcarDidEnter(uint256 railcarID) internal override {
        address[] memory members = RAILCAR.getMembers(railcarID);
        for (uint256 i = 0; i < members.length; i++) {
            tripsCompleted[members[i]]++;
            emit TripCompleted(members[i], tripsCompleted[members[i]]);
        }
    }
}
