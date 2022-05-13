// Description:
//   Software wallet
//
const { Wallet } = require('ethers')

const getWallet = (privateKey, provider) => {
  if (!privateKey) return

  const wallet = new Wallet(privateKey, provider)
  return wallet
};

module.exports = {
  getWallet,
};
