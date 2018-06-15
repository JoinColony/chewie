// Description:
//   Displays stats about Colony
//
// Commands:
//   hubot colony stats - display stats about Colony
//
// Author:
//   sprusr

const { providers, Wallet } = require('ethers')
const { default: EthersAdapter } = require('@colony/colony-js-adapter-ethers')
const { default: NetworkLoader } = require('@colony/colony-contract-loader-network')
const { default: ColonyNetworkClient } = require('@colony/colony-js-client')

module.exports = async (robot) => {
  const network = 'rinkeby'
  const privateKey = process.env.HUBOT_ETHEREUM_PRIVATE_KEY || '0x0123456789012345678901234567890123456789012345678901234567890123'

  const loader = new NetworkLoader({ network })
  const provider = new providers.EtherscanProvider(network)
  const wallet = new Wallet(privateKey, provider)

  const adapter = new EthersAdapter({
    loader,
    provider,
    wallet,
  })

  const networkClient = new ColonyNetworkClient({ adapter })
  await networkClient.init()

  const metaColonyClient = await networkClient.getMetaColonyClient()

  robot.respond(/colony stats$/i, async msg => {
    const { count } = await metaColonyClient.getTaskCount.call()
    msg.send(`Task count: ${count}`)
  })
}
