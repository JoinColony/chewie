// Description:
//   Software wallet
//
const { Wallet } = require('ethers')

const getWallet = () => {
  const wallet = Wallet.createRandom()
  return wallet
};

module.exports = {
  getWallet,
};
