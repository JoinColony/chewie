// Description:
//   Daily standup public shaming
//   TODO
//


const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');
const fetch = require('node-fetch');
const ethers = require('ethers')
const CronJob = require('cron').CronJob
const exec = require('await-exec')

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
const SKUNKWORKS_CHANNEL = process.env.SKUNKWORKS_DISCORD_CHANNEL;
const networkABI = require('./abis/IColonyNetwork.json');
const miningABI = require('./abis/IReputationMiningCycle.json');

let ongoingGenericIncident = false;
let ongoingGraphIncident = false;
let ongoingQAIncident = false;

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

  async function getMessage() {
    let message = ""
    // Get latest block from graph
    const graphNumberRes = getGraphLatestBlock("https://xdai.colony.io/graph/subgraphs/name/joinColony/subgraph")

    // Get latest block from QA graph

    const qaGraphNumberRes = getGraphLatestBlock("http://thegraph-query-red-network-100:8000/subgraphs/name/joinColony/subgraph")

    // Get latest block from blockscout
    const blockscoutRes = fetch("https://blockscout.com/xdai/mainnet/api?module=block&action=eth_block_number")

    // Get latest block from our RPC
    xdaichainRpcRes = fetch("https://rpc.xdaichain.com/", {
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

    const [graphNumber, qaGraphNumber, blockScoutBlock, RPCBlock, balance, xdaichainRpcBlock] = await Promise.all([graphNumberRes, qaGraphNumberRes, blockscoutRes, rpcRes, balanceRes, xdaichainRpcRes])

    output = await blockScoutBlock.json()
    let blockscoutLatestBlock = parseInt(output.result,16)
    message += `Blockscout latest block: ${blockscoutLatestBlock}\n`

    // Xdaichain.com latest block
    output = await xdaichainRpcBlock.json()
    xdaichainLatestBlock = parseInt(output.result,16)
    message += `Xdaichain.com latest block: ${xdaichainLatestBlock}\n`

    // How does our rpc block compare?
    output = await RPCBlock.json()
    rpcLatestBlock = parseInt(output.result,16)
    
    if (isNaN(blockscoutLatestBlock)) { blockscoutLatestBlock = rpcLatestBlock }

    smallestRpcDiscrepancy = Math.min(
        Math.abs(rpcLatestBlock-blockscoutLatestBlock),
        Math.abs(rpcLatestBlock-xdaichainLatestBlock)
    )
    message += `${status(smallestRpcDiscrepancy, 12, 24)} Our RPC latest block: ${rpcLatestBlock}\n`
    
    // Graph latest block
    smallestGraphDiscrepancy = Math.min(
        Math.abs(graphNumber-blockscoutLatestBlock),
        Math.abs(graphNumber-xdaichainLatestBlock)
    )

    message += `${status(smallestGraphDiscrepancy, 24, 48)} Our graph latest block: ${graphNumber}\n`

    if ((blockscoutLatestBlock - graphNumber) >= 48 && !ongoingGraphIncident){
      try { // Try and restart the graph digest pod
        // By the time this happens, the deployments script should have authed us
        // Get production colour
        let res = await exec("kubectl get svc nginx-prod-2 -o yaml | grep colour: | awk '{print $2}' | tr -d '\n'")
        const productionColour = res.stdout;
        // Get production graph digest node
        res = await exec(`kubectl get pods --sort-by=.metadata.creationTimestamp | grep digest-${productionColour} | tail -n1 | awk '{print $1}' | tr -d '\n'`)
        const productionGraphDigest = res.stdout;
        // delete it
        await exec(`kubectl delete pod ${productionGraphDigest}`)
        message += "**I have tried to restart the graph. If successful, incident will resolve itself shortly**\n"
      } catch (err) {
        console.log(err)
        message += "**Attempted restart of graph failed - check logs. I will not try again for this incident**\n"
      }
    }

    // QA Graph latest block
    smallestQAGraphDiscrepancy = Math.min(
        Math.abs(qaGraphNumber-blockscoutLatestBlock),
        Math.abs(qaGraphNumber-xdaichainLatestBlock)
    )

    if ((blockscoutLatestBlock - qaGraphNumber) >= 48  && !ongoingQAIncident){
      ongoingQAIncident = true;
      try { // Try and restart the qa graph digest pod
        // By the time this happens, the deployments script should have authed us
        // QA colour is red
        const colour = "red"
        // Get production graph digest node
        res = await exec(`kubectl get pods --sort-by=.metadata.creationTimestamp | grep digest-${colour} | tail -n1 | awk '{print $1}' | tr -d '\n'`)
        const qaGraphDigest = res.stdout;
        // delete it
        await exec(`kubectl delete pod ${qaGraphDigest}`)
        await channel.send(`**Attempted to restart QA subgraph as it appeared ${smallestQAGraphDiscrepancy} blocks behind.**`)
      } catch (err) {
        console.log(err)
        await channel.send("**Attempted restart of QA graph failed - check logs.**\n")
      }
    } else if ((blockscoutLatestBlock - qaGraphNumber) < 48  && ongoingQAIncident){
      ongoingQAIncident = false;
      await channel.send(`QA subgraph appears fixed`)
    }


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
    message += `${status(secondsSinceOpen, 3600, 4500)} Time since last mining cycle completed: ${(secondsSinceOpen/60).toFixed(0)} minutes\n`

    nSubmitted = await rm.getNUniqueSubmittedHashes();

    message += `${status(nSubmitted, 2,10000)} ${nSubmitted} unique submissions so far this cycle\n`
    return message
  }

  robot.hear(/^!status$/, async (res) => {
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

  const setupCronJob = robot => {
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
  setupCronJob(robot)
}
