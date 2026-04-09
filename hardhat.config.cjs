require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;

const networks = {
  localhost: {
    url: "http://127.0.0.1:8545",
  },
};

if (SEPOLIA_PRIVATE_KEY) {
  const pk = SEPOLIA_PRIVATE_KEY.startsWith('0x') ? SEPOLIA_PRIVATE_KEY : `0x${SEPOLIA_PRIVATE_KEY}`;
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    accounts: [pk],
  };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: networks,
  paths: {
    artifacts: "./artifacts",
  },
};