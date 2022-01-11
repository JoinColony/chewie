// Description:
//   Daily standup public shaming
//   TODO
//


const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');
const fetch = require('node-fetch');
const ethers = require('ethers')

// Minimal ABIs

async function getGraphLatestBlock(url) {
  let query = {"query": "{_meta{block {number} }}"}

  res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(query)
  })

  let r = await res.json()
  return parseInt(r.data._meta.block.number);
}

// #Skunkworks
const SKUNKWORKS_CHANNEL = '720952130562687016';
const networkABI = require('./abis/IColonyNetwork.json');
const miningABI = require('./abis/IReputationMiningCycle.json');

module.exports = robot => {
  const { brain, messageChannel } = robot
  const channel = robot.client.channels.cache.get(SKUNKWORKS_CHANNEL)

  function status(input, threshold1, threshold2){
    if (input < threshold1){
      return "🟢";
    }
    if (input < threshold2){
      return "🟡";
    }
    return "🔴";
  }

  async function postStatus() {
        message = ""
    // Get latest block from graph
    const graphNumberRes = getGraphLatestBlock("https://xdai.colony.io/graph/subgraphs/name/joinColony/subgraph")
    // Get latest block from blockscout
    const blockscoutRes = fetch("https://blockscout.com/xdai/mainnet/api?module=block&action=eth_block_number")
    // Get latest block from our RPC
    rpcRes = fetch("https://xdai.colony.io/rpc2/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "jsonrpc":"2.0",
        "method":"eth_blockNumber",
        "params":[],
        "id":1
      })
    })

    // Get miner balance.
    balanceRes = fetch("https://xdai.colony.io/rpc2/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "jsonrpc":"2.0",
        "method":"eth_getBalance",
        "params":[process.env.MINER_ADDRESS],
        "id":1
      })
    })

    const [graphNumber, blockScoutBlock, RPCBlock, balance] = await Promise.all([graphNumberRes, blockscoutRes, rpcRes, balanceRes])

    output = await blockScoutBlock.json()
    const blockscoutLatestBlock = parseInt(output.result,16)
    message += `Blockscout latest block: ${blockscoutLatestBlock}\n`

    // How does our rpc block compare?
    output = await RPCBlock.json()
    rpcLatestBlock = parseInt(output.result,16)

    message += `${status(Math.abs(rpcLatestBlock-blockscoutLatestBlock), 4, 12)} Our RPC latest block: ${rpcLatestBlock}\n`

    // Graph latest block
    message += `${status(Math.abs(graphNumber-blockscoutLatestBlock), 4, 12)} Our graph latest block: ${rpcLatestBlock}\n`

    // Miner balance

    output = await balance.json()
    minerBalance = parseInt(output.result,16)/10**18
    message += `${status(-minerBalance, -1, -0.5)} Miner balance: ${minerBalance}\n`

    // Get reputation mining cycle status
    const provider = new ethers.providers.JsonRpcProvider("https://rpc.xdaichain.com")
    cn = new ethers.Contract(process.env.NETWORK_ADDRESS, networkABI, provider)
    miningAddress = await cn.getReputationMiningCycle(true);

    rm = new ethers.Contract(miningAddress, miningABI, provider);
    openTimestamp = await rm.getReputationMiningWindowOpenTimestamp();
    secondsSinceOpen = Math.floor(Date.now()/1000) - openTimestamp;
    message += `${status(secondsSinceOpen, 3600, 3900)} Time since last mining cycle completed: ${(secondsSinceOpen/60).toFixed(0)} minutes\n`

    nSubmitted = await rm.getNUniqueSubmittedHashes();

    message += `${status(nSubmitted, 2,10000)} ${nSubmitted} unique submissions so far this cycle\n`

    channel.send(message)
  }

  robot.hear(/!status/, async (res) => {
    postStatus();
  })
}
