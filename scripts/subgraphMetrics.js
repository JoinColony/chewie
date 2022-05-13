// Description:
//   Colony Metrics
//

const fetch = require('node-fetch')
const { getAddress } = require('ethers/utils')

const { getWallet } = require('./utils/wallet');
const { getChallenge, getToken } = require('./utils/colonyServer.service');

// #Skunkworks
const SKUNKWORKS_CHANNEL = '965968631047549070'; // AGREEMI DEV CHANNEL

module.exports = robot => {
  const channel = robot.client.channels.cache.get(SKUNKWORKS_CHANNEL)

  async function getMessage() {
    // Use software wallet for members requests
    const wallet = await getWallet(process.env.XDAI_WALLET_PRIVATE_KEY, process.env.RPC_URL)

    // Get jwt token
    const { challenge } = await getChallenge(wallet)
    const signature = await wallet.signMessage(challenge)
    const { token: authToken } = await getToken(challenge, signature)

    let message = ""
    // Get Colony Metrics SubGraph
    const colonyMetrics = "https://api.thegraph.com/subgraphs/name/arrenv/colony-metrics-subgraph"
    // Get key metrics
    const metricsRes = fetch(colonyMetrics, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({"query": `{
        colonyMetricsDailies(first: 32, orderBy: date, orderDirection: desc) {
          id
          date
          colonies
          newColonies
          domains
          totalTokens
          totalUnlockedTokens
        }
        colonyMetrics(id: 1) {
          id
          colonies
          domains
          totalTokens
          totalUnlockedTokens
        }
        votingReputationExtensions(first: 5) {
          id
          installs
          uninstalled
          initialised
          motions
          motionsStaked
        }
      }` ,"variables":{}})
    })
      .then(response => response.json())
      .then(data => {
        return data
      })
      .catch((e) => {
        console.log(e)
      })

    const [metricsOutput] = await Promise.all([metricsRes])

    // Calculate colony metrics
    const latestColonies = metricsOutput.data.colonyMetricsDailies[0].colonies
    const thirtyDayColonies = metricsOutput.data.colonyMetricsDailies[14].colonies
    const sixtyDayColonies = metricsOutput.data.colonyMetricsDailies[29].colonies
    const diffThirtyDayColonies = latestColonies - thirtyDayColonies
    const diffSixtyDayColonies = thirtyDayColonies - sixtyDayColonies

    const newColoniesAvg = avgValue(metricsOutput.data.colonyMetricsDailies.slice(0, 14), "newColonies")
    const prevNewColoniesAvg = avgValue(metricsOutput.data.colonyMetricsDailies.slice(15, 29), "newColonies")

    // Get all colony addresses
    const numQueries = Math.ceil(metricsOutput.data.colonyMetrics.colonies / 1000)
    const coloniesArr = []
    for (i = 0; i < numQueries; i++) {
      const queryParamters = `first: 1000, skip: ${i * 1000}`
      const coloniesQuery = fetch(colonyMetrics, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({"query": `{
          colonies(${queryParamters}) {
            id
            created
          }
        }` ,"variables":{}})
      })
        .then(response => response.json())
        .then(data => {
          return data
        })
        .catch((e) => {
          console.log(e)
        })

      const [coloniesOutput] = await Promise.all([coloniesQuery])
      coloniesArr.push(coloniesOutput.data.colonies)
    }

    const colonies = coloniesArr.flat()

    // Get members from server
    const membersServer = `${process.env.SERVER_ENDPOINT}/graphql`
    // Get total members
    const memberQuerySize = 400
    const membersArr = []
    for (let i = 0; i < colonies.length; i += memberQuerySize) {
      let query = `query ColonyMembers(`
      const variables = {}
      const colonyChunk = colonies.slice(i, i + memberQuerySize)
      for (let j = 0; j < colonyChunk.length; j++) {
        variables['colonyAddress_'+i+'_'+j] = getAddress(colonyChunk[j].id)
        query += `$colonyAddress_${i}_${j}: String!, `
      }
      query += `) {`
      for (let j = 0; j < colonyChunk.length; j++) {
        query += `subscribedUser_${i}_${j}: subscribedUsers(colonyAddress: $colonyAddress_${i}_${j}) {id createdAt} `
      }
      query += `}`

      const membersRes = fetch(membersServer, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({query, variables})
      })
        .then(response => response.json())
        .then(data => {
          return data
        })
        .catch((e) => {
          console.log('error', e)
        })

      const [membersOutput] = await Promise.all([membersRes])
      const membersPush = Object.entries(membersOutput.data).map(members => members[1])
      membersArr.push(membersPush)
    }

    const members = membersArr.flat().flat()

    // Calculate member metrics
    uniqueMembers = members.filter((value, index, array) => array.indexOf(value) === index)
    let thirtyDayMembers = 0
    let sixtyDayMembers = 0

    uniqueMembers.map((member) => {
      const thirtyDays = new Date(new Date().setDate(new Date().getDate() - 30))
      const sixtyDays = new Date(new Date().setDate(new Date().getDate() - 60))
      const memberDate = new Date(member.createdAt)
      if (memberDate > thirtyDays) {
        ++thirtyDayMembers
      }
      if (thirtyDays > memberDate && memberDate > sixtyDays) {
        ++sixtyDayMembers
      }
    })

    // Create the messages
    message += `**__Colony Metrics__**  ${getChangeIcon(diffThirtyDayColonies, diffSixtyDayColonies)}  \n\n`

    message += `> Total Colonies: **__${numFormat(metricsOutput.data.colonyMetrics.colonies)}__**\n`
    message += `> New colonies past 30 days: **__${numFormat(diffThirtyDayColonies)}__**`
    message += ` (**${changeDirection(diffThirtyDayColonies, diffSixtyDayColonies)}%** over previous 30 days)\n`
    message += `> 30 day new colonies avg.: **__${numFormat(newColoniesAvg)}__/day**`
    message += ` (**${changeDirection(newColoniesAvg, prevNewColoniesAvg)}%** previous average)\n\n`

    message += `> Total Members: **__${numFormat(uniqueMembers.length)}__**\n`
    message += `> New members past 30 days: **__${numFormat(thirtyDayMembers)}__**`
    message += ` (**${changeDirection(thirtyDayMembers, sixtyDayMembers)}%** over previous 30 days)\n\n`

    message += `> Total domains created: **__${numFormat(metricsOutput.data.colonyMetrics.domains)}__**\n\n`

    message += `> Total Motions & Disputes Installs: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].installs)}__**\n`
    message += `> Total Motions & Disputes Uninstalls: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].uninstalled)}__**\n`
    message += `> Total Motions created: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].motions)}__**\n`
    message += `> Total Motion Stakes made: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].motionsStaked)}__**\n`

    // subgraphMetrics needs to be updated for these values to work
    // message += `> Total tokens created: **__${metricsOutput.data.colonyMetrics.totalTokens}__**\n`
    // message += `> Total tokens unlocked: **__${metricsOutput.data.colonyMetrics.totalUnlockedTokens}__**\n`
    // message += `> Total value held (USD): **__${metricsOutput.data.colonyMetrics.usdAUM}__**\n`

    return message;

    function getChange(current, past) {
      return Math.round(((current - past) / past) * 100)
    }

    function avgValue(arr, ref) {
      const extractedValues = arr.map((day) => day[ref])
      const sumOfValues = extractedValues.reduce((a, b) => parseInt(a) + parseInt(b), 0);
      const avgOfValues = (sumOfValues / extractedValues.length) || 0;
      return Number.parseFloat(avgOfValues).toFixed(2)
    }

    function changeDirection(current, past) {
      const changeValue = getChange(current, past)
      if (changeValue === 0) {
        return "-"
      } else if (changeValue > 0) {
        return "▲" + Math.abs(changeValue)
      } else {
        return "▼" + Math.abs(changeValue)
      }
    }

    function getChangeIcon(current, past) {
      const bigChange = getChange(current, past)
      if (bigChange > 20) {
        return "👑"
      } else if (current > past) {
        return "🔼"
      } else if (current === past) {
        return "⏹️";
      } else {
        return "🔽"
      }
    }

    function numFormat(number) {
      return new Intl.NumberFormat().format(number)
    }
  }

  robot.hear(/^!metrics$/, async (res) => {
    const message = await getMessage();
    channel.send(message)
  })
}
