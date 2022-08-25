const { ethers } = require('ethers')
const colonyABI = require('./abis/IColonyNetwork.json')

// #Skunkworks Channel
const SKUNKWORKS_CHANNEL = process.env.SKUNKWORKS_DISCORD_CHANNEL
// Colony Contract Address
const NETWORK_ADDRESS = process.env.NETWORK_ADDRESS
// Gnosis Chain RPC URL
const RPC_URL = process.env.RPC_URL
// Ping Admin User
const DISCORD_USER_ID = process.env.DISCORD_USER_ID

module.exports = robot => {
  const channel = robot.client.channels.cache.get(SKUNKWORKS_CHANNEL)
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
  const contract = new ethers.Contract(NETWORK_ADDRESS, colonyABI, provider)

  contract.on("ExtensionUpgraded", (extensionId, colonyAddress, version) => {
    if (version.toString() === '6') {
      message = 'Extension Upgraded in Colony: ' + colonyAddress
      channel.send(`<@${DISCORD_USER_ID}> ` + message)
    }
  })

}
