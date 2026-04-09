const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const CredzOnChain = await hre.ethers.getContractFactory("CredzOnChain");
  const credzOnChain = await CredzOnChain.deploy();

  await credzOnChain.waitForDeployment();

  console.log("CredzOnChain deployed to:", credzOnChain.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });