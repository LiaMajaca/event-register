import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'demo.db');

// Initialize SQLite database
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    eventId INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    eventType INTEGER,
    timestamp INTEGER,
    organizer TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventId INTEGER NOT NULL,
    walletAddress TEXT NOT NULL,
    claimedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    transactionHash TEXT,
    UNIQUE(eventId, walletAddress),
    FOREIGN KEY(eventId) REFERENCES events(eventId)
  );
  
  CREATE INDEX IF NOT EXISTS idx_claims_wallet ON claims(walletAddress);
  CREATE INDEX IF NOT EXISTS idx_claims_event ON claims(eventId);
`);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Contract ABI
const CONTRACT_ABI = [
  {
    "type": "function",
    "name": "createEvent",
    "inputs": [
      { "name": "_name", "type": "string" },
      { "name": "_description", "type": "string" },
      { "name": "_eventType", "type": "uint256" },
      { "name": "_timestamp", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "issueBadge",
    "inputs": [
      { "name": "_eventId", "type": "uint256" },
      { "name": "_recipient", "type": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getLastEventId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getNextEventId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEvent",
    "inputs": [{ "name": "_eventId", "type": "uint256" }],
    "outputs": [
      { "name": "", "type": "string" },
      { "name": "", "type": "string" },
      { "name": "", "type": "uint256" },
      { "name": "", "type": "uint256" },
      { "name": "", "type": "address" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBadgesByOwner",
    "inputs": [{ "name": "_owner", "type": "address" }],
    "outputs": [
      {
        "type": "tuple[]",
        "components": [
          { "name": "name", "type": "string" },
          { "name": "description", "type": "string" },
          { "name": "eventType", "type": "uint256" },
          { "name": "timestamp", "type": "uint256" },
          { "name": "organizer", "type": "address" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBadgeDetails",
    "inputs": [{ "name": "_eventId", "type": "uint256" }],
    "outputs": [
      { "name": "", "type": "string" },
      { "name": "", "type": "string" },
      { "name": "", "type": "string" },
      { "name": "", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "checkClaimStatus",
    "inputs": [
      { "name": "_eventId", "type": "uint256" },
      { "name": "_wallet", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view"
  }
];

// Connect to contract
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || 'https://rpc-sepolia.rockx.com');
let signer = null;
let contract = null;

// Only create signer if private key exists
if (process.env.SEPOLIA_PRIVATE_KEY) {
  try {
    signer = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY, provider);
    console.log('Signer initialized:', signer.address);
  } catch (err) {
    console.warn('Warning: Could not initialize signer with provided private key. Using provider only.');
  }
}

// Contract address - use deployed Sepolia contract
const contractAddress = process.env.CONTRACT_ADDRESS || '0x7465a155a76689C4b5cBFe967C7Dc56dB312CFaf';
if (contractAddress && contractAddress !== 'YOUR_CONTRACT_ADDRESS' && signer) {
  try {
    contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);
    console.log('Contract initialized at:', contractAddress);
    console.log('Signer connected for transactions');
  } catch (err) {
    console.warn('Warning: Could not initialize contract:', err.message);
  }
}

// Load persisted events into memory on startup for quick access
function loadEventsFromDb() {
  const rows = db.prepare('SELECT * FROM events').all();
  const events = {};
  let maxId = 0;
  rows.forEach(row => {
    events[row.eventId] = row;
    if (row.eventId > maxId) maxId = row.eventId;
  });
  return { events, nextId: maxId + 1 };
}

const { events, nextId } = loadEventsFromDb();
let nextEventId = nextId;
console.log(`Loaded ${Object.keys(events).length} events from database, next eventId: ${nextEventId}`);

// Create Event Endpoint - Now calls blockchain contract
app.post('/create_event', async (req, res) => {
  try {
    const { name, description, eventType, timestamp, organizer } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, detail: 'Event name is required' });
    }

    const eventName = name;
    const eventDesc = description || '';
    const eventTypeNum = eventType || 1;
    const eventTimestamp = timestamp || Math.floor(Date.now() / 1000);
    const orgAddress = organizer || 'demo_organizer';

    // Call blockchain contract to create event
    if (contract && signer) {
      try {
        console.log('Creating event on-chain:', { eventName, eventDesc, eventTypeNum, eventTimestamp });
        const tx = await contract.createEvent(
          eventName,
          eventDesc,
          eventTypeNum,
          eventTimestamp
        );
        const receipt = await tx.wait();
        console.log('Event created on-chain. Transaction hash:', receipt.hash);

        // Parse event ID from contract (use the transaction result)
        const blockchainEventId = await contract.getLastEventId();
        console.log('Blockchain event ID:', blockchainEventId.toString());

        // Store in database for quick access
        db.prepare(`
          INSERT INTO events (eventId, name, description, eventType, timestamp, organizer)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(Number(blockchainEventId), eventName, eventDesc, eventTypeNum, eventTimestamp, orgAddress);

        events[Number(blockchainEventId)] = {
          eventId: Number(blockchainEventId),
          name: eventName,
          description: eventDesc,
          eventType: eventTypeNum,
          timestamp: eventTimestamp,
          organizer: orgAddress
        };

        return res.json({
          success: true,
          eventId: Number(blockchainEventId),
          transactionHash: receipt.hash,
          message: 'Event created successfully on-chain'
        });
      } catch (blockchainErr) {
        console.error('Blockchain call failed:', blockchainErr.message);
        // Fallback to mock storage if contract fails
        console.log('Falling back to mock storage');
      }
    }

    // Fallback: Mock storage if contract not available
    const eventId = nextEventId++;
    const eventData = {
      eventId,
      name: eventName,
      description: eventDesc,
      eventType: eventTypeNum,
      timestamp: eventTimestamp,
      organizer: orgAddress
    };

    db.prepare(`
      INSERT INTO events (eventId, name, description, eventType, timestamp, organizer)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventData.eventId, eventData.name, eventData.description, eventData.eventType, eventData.timestamp, eventData.organizer);

    events[eventId] = eventData;

    res.json({
      success: true,
      eventId: eventId,
      message: 'Event created successfully (mock storage)'
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ detail: error.message });
  }
});

// Generate QR Code Endpoint
app.post('/generate_qr', async (req, res) => {
  try {
    const { eventId } = req.body;
    // Use a default claim URL for demo; frontend will handle host dynamically in most cases
    const claimUrl = `http://127.0.0.1:8080/claim.html?eventId=${eventId}`;

    const qrCode = await QRCode.toDataURL(claimUrl);
    const base64 = qrCode.replace('data:image/png;base64,', '');

    res.json({
      success: true,
      qr_code_base64: base64,
      url: claimUrl
    });
  } catch (error) {
    console.error('Error generating QR:', error);
    res.status(500).json({ detail: error.message });
  }
});

// Claim Badge Endpoint - Now calls blockchain contract
app.post('/claim_badge', async (req, res) => {
  try {
    const { eventId, walletAddress } = req.body;
    if (!eventId || !events[eventId]) {
      return res.status(400).json({ success: false, detail: 'Event not found' });
    }
    if (!walletAddress) {
      return res.status(400).json({ success: false, detail: 'Missing walletAddress' });
    }

    const walletLower = walletAddress.toLowerCase();
    
    // Check if already claimed
    const existing = db.prepare('SELECT * FROM claims WHERE eventId = ? AND walletAddress = ?').get(eventId, walletLower);
    if (existing) {
      return res.status(400).json({ success: false, detail: 'Badge already claimed for this wallet' });
    }

    let txHash = null;

    // Call blockchain contract to issue badge
    if (contract && signer) {
      try {
        console.log('Issuing badge on-chain:', { eventId, walletAddress });
        const tx = await contract.issueBadge(eventId, walletAddress);
        const receipt = await tx.wait();
        txHash = receipt.hash;
        console.log('Badge issued on-chain. Transaction hash:', txHash);
      } catch (blockchainErr) {
        console.error('Blockchain call failed:', blockchainErr.message);
        // Fallback to mock tx if contract fails
        console.log('Falling back to mock transaction hash');
        txHash = '0x' + Math.random().toString(16).slice(2);
      }
    } else {
      // Mock tx hash if contract not available
      txHash = '0x' + Math.random().toString(16).slice(2);
    }

    // Persist claim to database
    db.prepare(`
      INSERT INTO claims (eventId, walletAddress, transactionHash)
      VALUES (?, ?, ?)
    `).run(eventId, walletLower, txHash);

    res.json({
      success: true,
      status: 'success',
      transactionHash: txHash,
      message: 'Badge claimed successfully'
    });
  } catch (error) {
    console.error('Error claiming badge:', error);
    res.status(500).json({ detail: error.message });
  }
});

// Get Badge Details Endpoint
app.get('/get_badge_details', async (req, res) => {
  try {
    const { eventId, walletAddress } = req.query;
    if (!eventId || !events[eventId]) {
      return res.status(404).json({ success: false, detail: 'Event not found' });
    }

    const event = events[eventId];
    const badge = {
      success: true,
      name: event.name,
      description: event.description,
      image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="180" height="180"%3E%3Cdefs%3E%3ClinearGradient id="grad" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" style="stop-color:%233b82f6;stop-opacity:1" /%3E%3Cstop offset="100%25" style="stop-color:%232563eb;stop-opacity:1" /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23grad)" width="180" height="180" rx="16"/%3E%3Ctext x="50%25" y="50%25" font-size="80" text-anchor="middle" dy=".3em"%3EðŸ†%3C/text%3E%3C/svg%3E',
      eventId: parseInt(eventId)
    };

    if (walletAddress) {
      const walletLower = walletAddress.toLowerCase();
      const claim = db.prepare('SELECT * FROM claims WHERE eventId = ? AND walletAddress = ?').get(parseInt(eventId), walletLower);
      badge.claimed = !!claim;
      if (!badge.claimed) {
        badge.success = false;
        badge.detail = 'Badge not claimed by this wallet';
      }
    }

    res.json(badge);
  } catch (error) {
    console.error('Error getting badge details:', error);
    res.status(500).json({ detail: error.message });
  }
});

// Get Claimed Badges Endpoint
app.get('/get_claimed_badges', async (req, res) => {
  try {
    const { walletAddress } = req.query;
    if (!walletAddress) {
      return res.status(400).json({ success: false, detail: 'Missing walletAddress' });
    }

    const walletLower = walletAddress.toLowerCase();
    
    // Query claims from database
    const claims = db.prepare(`
      SELECT e.* FROM events e
      INNER JOIN claims c ON e.eventId = c.eventId
      WHERE c.walletAddress = ?
      ORDER BY c.claimedAt DESC
    `).all(walletLower);

    res.json({
      success: true,
      badges: claims,
      message: 'Claimed badges retrieved'
    });
  } catch (error) {
    console.error('Error getting claimed badges:', error);
    res.status(500).json({ detail: error.message });
  }
});

// Get Events by Organizer Endpoint
app.get('/get_events_by_organizer', async (req, res) => {
  try {
    const { organizer } = req.query;
    if (!organizer) {
      return res.status(400).json({ success: false, detail: 'Missing organizer address' });
    }
    const orgLower = organizer.toLowerCase();
    const eventRows = db.prepare('SELECT * FROM events WHERE LOWER(organizer) = ? ORDER BY eventId DESC').all(orgLower);
    res.json({ success: true, events: eventRows });
  } catch (error) {
    console.error('Error getting events by organizer:', error);
    res.status(500).json({ detail: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  console.log(`Backend server running on http://127.0.0.1:${PORT}`);
  console.log(`Database: ${dbPath}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database and server...');
  db.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});