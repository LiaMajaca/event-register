const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("CredzOnChainModule", (m) => {
  const credzOnChain = m.contract("CredzOnChain");

  return { credzOnChain };
});