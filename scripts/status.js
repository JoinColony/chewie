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
    return NaN;
  }
}

async function getBlockIngestorLatestBlock(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        "query": "query test {\n  getIngestorStats(id: \"STATS\") {\n    value\n  }\n}\n",
        "variables": {},
        "operationName": "test"
      })
  });
  const output = await res.json()
  const stats = JSON.parse(output.data.getIngestorStats.value);
  return parseInt(stats.lastBlockNumber,10);
}

async function getBlockscoutLatestBlock() {
  try {
    const blockScoutBlock = await fetch("https://blockscout.com/xdai/mainnet/api?module=block&action=eth_block_number")
    const output = await blockScoutBlock.json()
    let blockscoutLatestBlock = parseInt(output.result,16)
    return blockscoutLatestBlock;
  } catch (err) {
    return NaN;
  }
}

async function getArbiscanLatestBlock() {
  try {
    const arbiscanBlock = await fetch(`https://api.arbiscan.io/api?module=proxy&action=eth_blockNumber&apikey=${process.env.ARBISCAN_API_KEY}`)
    const output = await arbiscanBlock.json()
    let arbiscanLatestBlock = parseInt(output.result,16)
    return arbiscanLatestBlock;
  } catch (err) {
    return NaN;
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
        "params":[account, "latest"],
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

const RPC_URL = "https://xdai.colony.io/rpc/"

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

  async function getMessageGnosis() {
    let message = "**On Gnosis:**\n"
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
    const rpcRes = getRPCLatestBlock(RPC_URL)

    // Get miner balance.
    const balanceRes = await getBalance(process.env.MINER_ADDRESS, RPC_URL)
    const balanceRes2 = await getBalance(process.env.MINER_ADDRESS2, RPC_URL)
    const balanceRes3 = await getBalance(process.env.MINER_ADDRESS3, RPC_URL)

    // Get mtx broadcaster balance.
    const mtxBalanceRes = await getBalance(process.env.BROADCASTER_ADDRESS, RPC_URL)

    let [graphNumber, qaGraphNumber, blockScoutLatestBlock, RPCBlock, minerBalance, minerBalance2, minerBalance3, gnosischainLatestBlock, mtxBalance] = await Promise.all([graphNumberRes, qaGraphNumberRes, blockscoutRes, rpcRes, balanceRes, balanceRes2, balanceRes3, gnosischainRes, mtxBalanceRes])

    message += `Blockscout latest block: ${blockScoutLatestBlock}\n`

    // Gnosischain.com latest block
    message += `Gnosischain.com latest block: ${gnosischainLatestBlock}\n`

    // How does our rpc block compare?
    if (isNaN(blockScoutLatestBlock) && RPCBlock > 0) { blockScoutLatestBlock = RPCBlock }
    if (isNaN(gnosischainLatestBlock) && RPCBlock > 0) { gnosischainLatestBlock = RPCBlock }

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

    message += `${status(-minerBalance, -10, -4)} Miner balance (\`${process.env.MINER_ADDRESS.slice(0, 6)}...${process.env.MINER_ADDRESS.slice(-4)}\`): ${minerBalance}\n`
    message += `${status(-minerBalance2, -10, -4)} Miner balance (\`${process.env.MINER_ADDRESS2.slice(0, 6)}...${process.env.MINER_ADDRESS2.slice(-4)}\`): ${minerBalance2}\n`
    message += `${status(-minerBalance3, -10, -4)} Miner balance (\`${process.env.MINER_ADDRESS3.slice(0, 6)}...${process.env.MINER_ADDRESS3.slice(-4)}\`): ${minerBalance3}\n`

    // MTX Broadcaster balance
    message += `${status(-mtxBalance, -20, -10)} Metatx broadcaster balance (\`${process.env.BROADCASTER_ADDRESS.slice(0, 6)}...${process.env.BROADCASTER_ADDRESS.slice(-4)}\`): ${mtxBalance}\n`

    // Get reputation mining cycle status
    let secondsSinceOpen = -1;
    let nSubmitted = -1;
    try {
      let provider;
      // Use our RPC if okay
      if (RPCBlock > 0){
        provider = new ethers.providers.JsonRpcProvider(RPC_URL)
      } else {
        provider = new ethers.providers.JsonRpcProvider("https://rpc.gnosischain.com/");
      }

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

  async function getArbitrumMessage() {

    const ARBITRUM_MINER_ADDRESS = "0xd090822a84e037Acc8a169C54a5943FF9fB82236"
    const ARBITRUM_BROADCASTER_ADDRESS = "0xf4ab92A14c7CBc232E8293C59DfFbd98Fbdf9b3E"
    const ARBITRUM_NETWORK_ADDRESS = "0xcccccdcc0ccf6c708d860e19353c5f9a49accccc"
    const ARBITRUM_GRAPH_URL = "https://app.colony.io/auth-proxy/graphql"
    const ourRPC = process.env.ARBITRUM_RPC
    const publicRPC = process.env.ARBITRUM_PUBLIC_RPC


    // Get latest block from our RPC
    const ourRpcPromise = getRPCLatestBlock(ourRPC);

    // Get latest block from another RPC
    const publicRPCPromise = getRPCLatestBlock(publicRPC);

    // Get latest block from block ingestor
    const blockIngestorNumberPromise = getBlockIngestorLatestBlock(ARBITRUM_GRAPH_URL);

    // Get balance of miner
    const balancePromise = await getBalance(ARBITRUM_MINER_ADDRESS, ourRPC)

    // Get balance of MTX Broadcaster
    const mtxBalancePromise = await getBalance(ARBITRUM_BROADCASTER_ADDRESS, ourRPC)

    const arbiscanLatestBlockPromise = getArbiscanLatestBlock()

    let [ourRpcBlock, publicRpcBlock, ingestorNumber, minerBalance, mtxBalance, arbiscanLatestBlock] = await Promise.all([ourRpcPromise, publicRPCPromise, blockIngestorNumberPromise, balancePromise, mtxBalancePromise, arbiscanLatestBlockPromise])

    if (isNaN(arbiscanLatestBlock) && ourRpcBlock > 0) { arbiscanLatestBlock = ourRpcBlock }
    if (isNaN(publicRpcBlock) && ourRpcBlock > 0) { publicRpcBlock = ourRpcBlock }

    const smallestRpcDiscrepancy = Math.min(
      Math.abs(ourRpcBlock-arbiscanLatestBlock),
      Math.abs(ourRpcBlock-publicRpcBlock)
    )

    // Get time since last mining cycle completed
    // Get reputation mining cycle status
    let secondsSinceOpen = -1;
    let nSubmitted = -1;
    try {
      let provider;
      // Use our RPC if okay
      if (ourRpcBlock > 0){
        provider = new ethers.providers.JsonRpcProvider(ourRPC)
      } else {
        provider = new ethers.providers.JsonRpcProvider(publicRPC);
      }

      const cn = new ethers.Contract(ARBITRUM_NETWORK_ADDRESS, networkABI, provider)
      const miningAddress = await cn.getReputationMiningCycle(true);

      const rm = new ethers.Contract(miningAddress, miningABI, provider);
      const openTimestamp = await rm.getReputationMiningWindowOpenTimestamp();
      secondsSinceOpen = Math.floor(Date.now()/1000) - openTimestamp;

      nSubmitted = await rm.getNUniqueSubmittedHashes();
    } catch (err) {
      // Use default values for anything not set
    }

    let message = "**On Arbitrum:**\n"
    message += `Public RPC latest block: ${publicRpcBlock}\n`
    message += `Arbiscan latest block: ${arbiscanLatestBlock}\n`
    message += `${status(smallestRpcDiscrepancy, 60, 120)} Our RPC latest block: ${ourRpcBlock}\n`
    message += `${status(Math.abs(ingestorNumber-ourRpcBlock), 25*GRAPH_LAG_INCIDENT/2, 25*GRAPH_LAG_INCIDENT)} Our ingestor latest block: ${ingestorNumber}\n`
    message += `${status(-minerBalance, -0.05, -0.01)} Miner balance (\`${ARBITRUM_MINER_ADDRESS.slice(0, 6)}...${ARBITRUM_MINER_ADDRESS.slice(-4)}\`): ${minerBalance}\n`
    message += `${status(-mtxBalance, -0.1, -0.01)} Metatx broadcaster balance (\`${ARBITRUM_BROADCASTER_ADDRESS.slice(0, 6)}...${ARBITRUM_BROADCASTER_ADDRESS.slice(-4)}\`): ${mtxBalance}\n`
    message += `${status(secondsSinceOpen, 3600, 4500)} Time since last mining cycle completed: ${(secondsSinceOpen/60).toFixed(0)} minutes\n`
    message += `${status(nSubmitted, 2,10000)} ${nSubmitted} unique submissions so far this cycle\n`
    return message;
  }

  async function getMessage() {
    const gnosisMessage = await getMessageGnosis();
    const arbitrumMessage = await getArbitrumMessage();
    return "\n" + arbitrumMessage + "\n" + gnosisMessage;
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

  async function checkStatusArbitrum(){
    const message = await getArbitrumMessage();
    if (message.indexOf("🔴 Our graph latest block") != -1 && !ongoingGraphIncident) {
      ongoingGraphIncident = true;
      channel.send("There appears to be an incident with the graph. \n" + message)
    } else if (message.indexOf("🔴") != -1 && !ongoingGenericIncident && !ongoingGraphIncident){
      ongoingGenericIncident = true;
      channel.send("There appears to be a generic incident. \n" + message)
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


  const arbitrumJob = new CronJob({
    // Every minute
    cronTime: '00 * * * * *',
    onTick: () => {
      checkStatusArbitrum()
    },
    start: true,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  })
  arbitrumJob.start()

  }
  setupCronJob()
}
