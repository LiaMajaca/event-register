// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CredzOnChain
 * @dev A smart contract for creating events and issuing digital badges to participants.
 * 
 * This contract allows event organizers to:
 * - Create events with details like name, description, type, and timestamp
 * - Issue unique badges to participants for specific events
 * - Track which participants have claimed badges for which events
 * 
 * Participants can:
 * - Receive badges from event organizers
 * - View all badges they've earned
 * - Check their claim status for any event
 */
contract CredzOnChain {
    
  
    
    /**
     * @dev Represents an event with associated metadata
     * @param name The name of the event (e.g., "Blockchain Workshop 2024")
     * @param description Detailed description of the event
     * @param eventType Category or type of event (represented as uint256)
     * @param timestamp Unix timestamp of when the event occurred
     * @param organizer Address of the account that created the event
     */
    struct Event {
        string name;
        string description;
        uint256 eventType;
        uint256 timestamp;
        address organizer;
    }

    // ============================================
    // STATE VARIABLES
    // ============================================
    
    /// @dev Maps event IDs to their corresponding Event data
    mapping(uint256 => Event) public events;
    
    /// @dev Tracks whether a specific address has claimed a badge for a specific event
    /// @notice Format: hasClaimed[eventId][walletAddress] = true/false
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    
    /// @dev Stores all event IDs for which a recipient has claimed badges
    /// @notice Format: claimedBadgesByRecipient[walletAddress] = [eventId1, eventId2, ...]
    mapping(address => uint256[]) public claimedBadgesByRecipient;

    /// @dev Counter for generating unique event IDs (auto-incrementing)
    uint256 private nextEventId;

    // ============================================
    // EVENTS
    // ============================================
    
    /**
     * @dev Emitted when a new event is created
     * @param eventId Unique identifier for the created event
     * @param name Name of the event
     * @param organizer Address of the event creator
     */
    event EventCreated(uint256 indexed eventId, string name, address indexed organizer);
    
    /**
     * @dev Emitted when a badge is issued to a recipient
     * @param eventId The event for which the badge is issued
     * @param recipient Address receiving the badge
     * @param issuer Address that issued the badge (should be the event organizer)
     */
    event BadgeIssued(uint256 indexed eventId, address indexed recipient, address indexed issuer);

    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    /**
     * @dev Initializes the contract with nextEventId set to 0
     */
    constructor() {
        nextEventId = 0;
    }

    // ============================================
    // CORE FUNCTIONS
    // ============================================
    
    /**
     * @dev Creates a new event and assigns it a unique ID
     * @param _name Name of the event
     * @param _description Detailed description of what the event is about
     * @param _eventType Numeric category/type identifier for the event
     * @param _timestamp Unix timestamp representing when the event takes place
     * @return eventId The unique ID assigned to this event
     * 
     * @notice Anyone can create an event. The creator becomes the organizer.
     * @notice The organizer is the only one who can later issue badges for this event.
     */
    function createEvent(
        string memory _name, 
        string memory _description, 
        uint256 _eventType, 
        uint256 _timestamp
    ) public returns (uint256) {
        uint256 eventId = nextEventId++;
        events[eventId] = Event({
            name: _name,
            description: _description,
            eventType: _eventType,
            timestamp: _timestamp,
            organizer: msg.sender
        });
        emit EventCreated(eventId, _name, msg.sender);
        return eventId;
    }

    /**
     * @dev Issues a badge to a recipient for a specific event
     * @param _eventId The ID of the event for which to issue the badge
     * @param _recipient The wallet address that will receive the badge
     * 
     * @notice Only the event organizer can issue badges
     * @notice Each recipient can only receive one badge per event (no duplicates)
     * @notice Once issued, the badge is permanently recorded on-chain
     */
    function issueBadge(uint256 _eventId, address _recipient) public {
        require(
            events[_eventId].organizer == msg.sender, 
            "Only the event organizer can issue badges."
        );
        require(
            !hasClaimed[_eventId][_recipient], 
            "Badge already claimed for this event by this recipient."
        );

        hasClaimed[_eventId][_recipient] = true;
        claimedBadgesByRecipient[_recipient].push(_eventId);
        emit BadgeIssued(_eventId, _recipient, msg.sender);
    }

    // ============================================
    // VIEW FUNCTIONS (READ-ONLY)
    // ============================================
    
    /**
     * @dev Returns the ID of the most recently created event
     * @return The last event ID, or 0 if no events have been created
     */
    function getLastEventId() public view returns (uint256) {
        if (nextEventId == 0) {
            return 0; // No events created yet
        }
        return nextEventId - 1;
    }

    /**
     * @dev Returns the ID that will be assigned to the next created event
     * @return The next available event ID
     */
    function getNextEventId() public view returns (uint256) {
        return nextEventId;
    }

    /**
     * @dev Retrieves all details for a specific event
     * @param _eventId The ID of the event to query
     * @return name Event name
     * @return description Event description
     * @return eventType Event type/category
     * @return timestamp Event timestamp
     * @return organizer Address of the event creator
     */
    function getEvent(uint256 _eventId) public view returns (
        string memory, 
        string memory, 
        uint256, 
        uint256, 
        address
    ) {
        Event storage eventData = events[_eventId];
        return (
            eventData.name, 
            eventData.description, 
            eventData.eventType, 
            eventData.timestamp, 
            eventData.organizer
        );
    }

    /**
     * @dev Returns all badges (events) that a specific address has claimed
     * @param _owner The wallet address to query
     * @return An array of Event structs representing all badges earned by this address
     * 
     * @notice This returns the full event details for each badge
     */
    function getBadgesByOwner(address _owner) public view returns (Event[] memory) {
        uint256[] storage eventIds = claimedBadgesByRecipient[_owner];
        Event[] memory ownerBadges = new Event[](eventIds.length);
        for (uint256 i = 0; i < eventIds.length; i++) {
            ownerBadges[i] = events[eventIds[i]];
        }
        return ownerBadges;
    }

    /**
     * @dev Returns specific details about a badge for display purposes
     * @param _eventId The event/badge ID to query
     * @return name Badge/event name
     * @return description Badge/event description
     * @return imageUrl Placeholder URL for badge image (currently hardcoded)
     * @return tokenId The event ID, used as a token identifier
     * 
     * @notice The image URL is currently a placeholder and should be updated for production
     */
    function getBadgeDetails(uint256 _eventId) public view returns (
        string memory, 
        string memory, 
        string memory, 
        uint256
    ) {
        Event storage eventData = events[_eventId];
        // For now, a placeholder image and eventId as tokenId
        return (
            eventData.name, 
            eventData.description, 
            "https://example.com/badge_image.png", 
            _eventId
        );
    }

    /**
     * @dev Checks whether a specific wallet has claimed a badge for a specific event
     * @param _eventId The event ID to check
     * @param _wallet The wallet address to check
     * @return true if the wallet has claimed the badge, false otherwise
     */
    function checkClaimStatus(uint256 _eventId, address _wallet) public view returns (bool) {
        return hasClaimed[_eventId][_wallet];
    }
}

/**
 * ============================================
 * HOW TO USE THIS CONTRACT
 * ============================================
 * 
 * 1. CREATE AN EVENT
 *    Call createEvent() with event details
 *    Example: createEvent("Web3 Summit", "Annual blockchain conference", 1, 1704067200)
 *    Returns: event ID (e.g., 0 for first event)
 * 
 * 2. ISSUE BADGES
 *    As the event organizer, call issueBadge() with eventId and recipient address
 *    Example: issueBadge(0, 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb)
 *    Only organizers can issue badges, and each recipient gets one badge per event
 * 
 * 3. CHECK BADGES
 *    Anyone can call getBadgesByOwner() to see all badges for an address
 *    Example: getBadgesByOwner(0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb)
 *    Returns: array of all events/badges earned by that address
 * 
 * 4. VERIFY CLAIM STATUS
 *    Call checkClaimStatus() to see if someone has a specific badge
 *    Example: checkClaimStatus(0, 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb)
 *    Returns: true if they have the badge, false if not
 */