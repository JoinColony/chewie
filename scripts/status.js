// Description:
//   Continuous status monitoring for various metrics

/* global process */

// const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');
const fetch = require('node-fetch');
const ethers = require('ethers')
const CronJob = require('cron').CronJob
const exec = require('await-exec')

// Minimal ABIs

async function getGraphLatestBlock(url) {
  try {
    let query = {"query": "{_meta{block {number} }}"}

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(query)
    })

    let r = await res.json()
    return parseInt(r.data._meta.block.number);
  } catch (err) {
    return -1;
  }
}

async function getRPCLatestBlock(url) {
  try {
    const rpcRes = await fetch(url, {
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
    const output = await rpcRes.json()
    const blockNumber = parseInt(output.result,16)
    return blockNumber
  } catch (err) {
    return -1;
  }
}

async function getBlockscoutLatestBlock() {
  try {
    const blockScoutBlock = await fetch("https://blockscout.com/xdai/mainnet/api?module=block&action=eth_block_number")
    const output = await blockScoutBlock.json()
    let blockscoutLatestBlock = parseInt(output.result,16)
    return blockscoutLatestBlock;
  } catch (err) {
    return -1;
  }
}

async function getBalance(account, url) {
  try {
    const balanceRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "jsonrpc":"2.0",
        "method":"eth_getBalance",
        "params":[account],
        "id":1
      })
    })
    const output = await balanceRes.json()
    const balance = parseInt(output.result,16)/10**18
    return balance;
  } catch (err) {
    return -1;
  }
}

// #Skunkworks
const SKUNKWORKS_CHANNEL = process.env.SKUNKWORKS_DISCORD_CHANNEL;
const networkABI = require('./abis/IColonyNetwork.json');
const miningABI = require('./abis/IReputationMiningCycle.json');

const GRAPH_LAG_INCIDENT = 96;

let ongoingGenericIncident = false;
let ongoingGraphIncident = false;
let ongoingQAIncident = false;

module.exports = robot => {
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

  async function getMessage() {
    let message = ""
    // Get latest block from graph
    const graphNumberRes = getGraphLatestBlock("https://xdai.colony.io/graph/subgraphs/name/joinColony/subgraph")

    // Get latest block from QA graph

    // const qaGraphNumberRes = getGraphLatestBlock("http://thegraph-query-red-network-100:8000/subgraphs/name/joinColony/subgraph")
    // Temporary (fake) url during transition
    const qaGraphNumberRes = getGraphLatestBlock("https://xdai.colony.io/graph/subgraphs/name/joinColony/subgraph")

    // Get latest block from blockscout

    const blockscoutRes = getBlockscoutLatestBlock()

    // Get latest block from our RPC
    const gnosischainRes = getRPCLatestBlock("https://rpc.gnosischain.com/")

    // Get latest block from our RPC
    const rpcRes = getRPCLatestBlock("https://xdai.colony.io/rpc2/")

    // Get miner balance.
    const balanceRes = await getBalance(process.env.MINER_ADDRESS, "https://xdai.colony.io/rpc2/")
    const balanceRes2 = await getBalance(process.env.MINER_ADDRESS2, "https://xdai.colony.io/rpc2/")
    const balanceRes3 = await getBalance(process.env.MINER_ADDRESS3, "https://xdai.colony.io/rpc2/")
    
    // Get mtx broadcaster balance.
    const mtxBalanceRes = await getBalance(process.env.BROADCASTER_ADDRESS, "https://xdai.colony.io/rpc2/")

    let [graphNumber, qaGraphNumber, blockScoutLatestBlock, RPCBlock, minerBalance, minerBalance2, minerBalance3, gnosischainLatestBlock, mtxBalance] = await Promise.all([graphNumberRes, qaGraphNumberRes, blockscoutRes, rpcRes, balanceRes, balanceRes2, balanceRes3, gnosischainRes, mtxBalanceRes])

    message += `Blockscout latest block: ${blockScoutLatestBlock}\n`

    // Gnosischain.com latest block
    message += `Gnosischain.com latest block: ${gnosischainLatestBlock}\n`

    // How does our rpc block compare?
    if (isNaN(blockScoutLatestBlock)) { blockScoutLatestBlock = RPCBlock }

    const smallestRpcDiscrepancy = Math.min(
        Math.abs(RPCBlock-blockScoutLatestBlock),
        Math.abs(RPCBlock-gnosischainLatestBlock)
    )
    message += `${status(smallestRpcDiscrepancy, 12, 24)} Our RPC latest block: ${RPCBlock}\n`
    
    // Graph latest block
    const smallestGraphDiscrepancy = Math.min(
        Math.abs(graphNumber-blockScoutLatestBlock),
        Math.abs(graphNumber-gnosischainLatestBlock)
    )

    message += `${status(smallestGraphDiscrepancy, GRAPH_LAG_INCIDENT/2, GRAPH_LAG_INCIDENT)} Our graph latest block: ${graphNumber}\n`

    // if ((blockScoutLatestBlock - graphNumber) >= GRAPH_LAG_INCIDENT && !ongoingGraphIncident){
    //   try { // Try and restart the graph digest pod
    //     // By the time this happens, the deployments script should have authed us
    //     // Get production colour
    //     let res = await exec("kubectl get svc nginx-prod-2 -o yaml | grep colour: | awk '{print $2}' | tr -d '\n'")
    //     const productionColour = res.stdout;
    //     // Get production graph digest node
    //     res = await exec(`kubectl get pods --sort-by=.metadata.creationTimestamp | grep digest-${productionColour} | tail -n1 | awk '{print $1}' | tr -d '\n'`)
    //     const productionGraphDigest = res.stdout;
    //     // delete it
    //     await exec(`kubectl delete pod ${productionGraphDigest}`)
    //     message += "**I have tried to restart the graph. If successful, incident will resolve itself shortly**\n"
    //   } catch (err) {
    //     console.log(err)
    //     message += "**Attempted restart of graph failed - check logs. I will not try again for this incident**\n"
    //   }
    // }

    // // QA Graph latest block
    // const smallestQAGraphDiscrepancy = Math.min(
    //     Math.abs(qaGraphNumber-blockScoutLatestBlock),
    //     Math.abs(qaGraphNumber-gnosischainLatestBlock)
    // )

    // if ((blockScoutLatestBlock - qaGraphNumber) >= GRAPH_LAG_INCIDENT  && !ongoingQAIncident){
    //   ongoingQAIncident = true;
    //   try { // Try and restart the qa graph digest pod
    //     // By the time this happens, the deployments script should have authed us
    //     // QA colour is red
    //     const colour = "red"
    //     // Get production graph digest node
    //     const res = await exec(`kubectl get pods --sort-by=.metadata.creationTimestamp | grep digest-${colour} | tail -n1 | awk '{print $1}' | tr -d '\n'`)
    //     const qaGraphDigest = res.stdout;
    //     // delete it
    //     await exec(`kubectl delete pod ${qaGraphDigest}`)
    //     await channel.send(`**Attempted to restart QA subgraph as it appeared ${smallestQAGraphDiscrepancy} blocks behind.**`)
    //   } catch (err) {
    //     console.log(err)
    //     await channel.send("**Attempted restart of QA graph failed - check logs.**\n")
    //   }
    // } else if ((blockScoutLatestBlock - qaGraphNumber) < GRAPH_LAG_INCIDENT  && ongoingQAIncident){
    //   ongoingQAIncident = false;
    //   await channel.send(`QA subgraph appears fixed`)
    // }


    // Miner balance

    message += `${status(-minerBalance, -1, -0.5)} Miner balance (\`${process.env.MINER_ADDRESS.slice(0, 6)}...${process.env.MINER_ADDRESS.slice(-4)}\`): ${minerBalance}\n`
    message += `${status(-minerBalance2, -1, -0.5)} Miner balance (\`${process.env.MINER_ADDRESS2.slice(0, 6)}...${process.env.MINER_ADDRESS2.slice(-4)}\`): ${minerBalance2}\n`
    message += `${status(-minerBalance3, -1, -0.5)} Miner balance (\`${process.env.MINER_ADDRESS3.slice(0, 6)}...${process.env.MINER_ADDRESS3.slice(-4)}\`): ${minerBalance3}\n`

    // MTX Broadcaster balance
    message += `${status(-mtxBalance, -1, -0.5)} Metatx broadcaster balance: ${mtxBalance}\n`

    // Get reputation mining cycle status
    let secondsSinceOpen = -1;
    let nSubmitted = -1;
    try {
      const provider = new ethers.providers.JsonRpcProvider("https://rpc.gnosischain.com")
      const cn = new ethers.Contract(process.env.NETWORK_ADDRESS, networkABI, provider)
      const miningAddress = await cn.getReputationMiningCycle(true);

      const rm = new ethers.Contract(miningAddress, miningABI, provider);
      const openTimestamp = await rm.getReputationMiningWindowOpenTimestamp();
      secondsSinceOpen = Math.floor(Date.now()/1000) - openTimestamp;

      nSubmitted = await rm.getNUniqueSubmittedHashes();
    } catch (err) {
      // Use default values for anything not set
    }

    message += `${status(secondsSinceOpen, 3600, 4500)} Time since last mining cycle completed: ${(secondsSinceOpen/60).toFixed(0)} minutes\n`
    message += `${status(nSubmitted, 2,10000)} ${nSubmitted} unique submissions so far this cycle\n`
    return message
  }

  robot.hear(/^!status$/, async () => {
    const message = await getMessage();
    channel.send(message)
    if (message.indexOf("🔴") == -1){
      ongoingGenericIncident = false;
      ongoingGraphIncident = false;
    }
  })

  async function checkStatus(){
    const message = await getMessage();
    if (message.indexOf("🔴 Our graph latest block") != -1 && !ongoingGraphIncident) {
      ongoingGraphIncident = true;
      channel.send("There appears to be an incident with the graph. \n" + message)
    } else if (message.indexOf("🔴") != -1 && !ongoingGenericIncident && !ongoingGraphIncident){
      ongoingGenericIncident = true;
      channel.send("There appears to be a generic incident. \n" + message)
    }

    if (message.indexOf("🔴") == -1 && (ongoingGenericIncident || ongoingGraphIncident)) {
      ongoingGenericIncident = false;
      ongoingGraphIncident = false;
      channel.send("Incident appears resolved.\n" + message)
    }
  }

  const setupCronJob = () => {
  const job = new CronJob({
    // Every minute
    cronTime: '00 * * * * *',
    onTick: () => {
      checkStatus()
    },
    start: true,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  })
  job.start()
  }
  setupCronJob()
}
