const { ethers } = require('ethers')
const colonyNetworkABI = require('./abis/IColonyNetwork.json')

// #Skunkworks Channel
const SKUNKWORKS_CHANNEL = process.env.SKUNKWORKS_DISCORD_CHANNEL
// Colony Contract Address
const NETWORK_ADDRESS = process.env.NETWORK_ADDRESS
// Gnosis Chain RPC URL
const RPC_URL = process.env.RPC_URL
// Ping Admin User
const DISCORD_USER_ID = process.env.UPGRADE_ALERT_DISCORD_USER_ID

async function getStorageSlot(url, address, slot) {
  try {
    const rpcRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "jsonrpc":"2.0",
        "method":"eth_getStorageAt",
        "params":[address, slot],
        "id":1
      })
    })
    const output = await rpcRes.json()
    return output.result;
  } catch (err) {
    return -1;
  }
}


module.exports = robot => {
  const channel = robot.client.channels.cache.get(SKUNKWORKS_CHANNEL)
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
  const contract = new ethers.Contract(NETWORK_ADDRESS, colonyNetworkABI, provider)

  contract.on("ExtensionUpgraded", async (extensionId, colonyAddress, version) => {
    const VOTING_REPUTATION="0xdc951b3d4193c331186bc2de3b4e659e51d8b00ef92751ae69abaa48a6ab38dd";
    if (version.toString() === '6' && extensionId === VOTING_REPUTATION) {
      const message = 'Extension Upgraded in Colony: ' + colonyAddress
      channel.send(`<@${DISCORD_USER_ID}> ` + message);
      const extensionAddress = await contract.getExtensionInstallation(VOTING_REPUTATION, colonyAddress)
      const ghostMotions = await getStorageSlot("https://rpc.gnosischain.com/", extensionAddress, 16)
      const ghostMotionsInt = parseInt(ghostMotions, 16);
      channel.send(`That colony has ${ghostMotionsInt} ghost motions.`)
    }
  })

}
