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

  robot.hear(/!colony ([0-9]*)$/i, async msg => {
    msg.send('Gathering data...');
    const { address } = await networkClient.getColony.call({ id: parseInt(msg.match[1], 10) })
    if (!address) {
      return msg.send("No such colony");
    }
    const colonyClient = await networkClient.getColonyClientByAddress(address)
    const { count } = await colonyClient.getTaskCount.call();
    let res = await colonyClient.getToken.call();
    const tokenAddress = res.address;
    let tokenName;
    let tokenSymbol;
    try {
      res = await colonyClient.token.getTokenInfo.call();
      tokenName = res.name;
      tokenSymbol = res.symbol;
    } catch (err){
      // No such properties on the token - possible if not ERC20 compliant, as BYOT allows
    }

    msg.send(`Address: ${address} \nTask count: ${count}\nToken Address: ${tokenAddress}\nToken Name: ${tokenName} (${tokenSymbol})`)
  })


  robot.hear(/!colony ([0-9]*) task ([0-9]*)$/i, async msg => {
    msg.send('Gathering data...')
    const { address } = await networkClient.getColony.call({ id: parseInt(msg.match[1], 10) })
    const taskId = parseInt(msg.match[2], 10);
    if (!address) {
      return msg.send("No such colony");
    }
    const colonyClient = await networkClient.getColonyClientByAddress(address);
    const task  = await colonyClient.getTask.call({taskId});
    let output = "";
    if (task.specificationHash){
      output += "Specification: https://gateway.ipfs.io/ipfs/QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC/\n"
    } else {
      output += "Specification: None\n"
    }

    if (task.deliverableHash){
      output += "Deliverable: https://gateway.ipfs.io/ipfs/QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC/\n"
    } else {
      output += "Deliverable: None\n"
    }
    output += `Finalized: ${task.finalized ? "Yes" : "No"}\n`
    output += `Cancelled: ${task.cancelled ? "Yes" : "No"}`
    output += `\nDue date: `
    if (task.dueDate){
      output += ` ${new Date(task.dueDate * 1000).toISOString()}`
    } else {
      output += ` none`
    }
    output += `\nDeliverable date: `;
    if (task.deliverableDate){
      output += `${new Date(task.deliverableDate * 1000).toISOString()}`
    } else {
      output += ` none`;
    }

    let res = await colonyClient.getTaskRole.call({taskId, role: 'MANAGER'} )
    output += `\nManager: ${ res.address }`
    res = await colonyClient.getTaskRole.call({taskId, role: 'EVALUATOR'} )
    output += `\nEvaluator: ${ res.address }`
    res = await colonyClient.getTaskRole.call({taskId, role: 'WORKER'} )
    output += `\nWorker: ${ res.address }`

    msg.send(output);
  })
}
