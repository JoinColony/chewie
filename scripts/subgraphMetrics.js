// Description:
//   Colony Metrics
//

const fetch = require('node-fetch')
const { Wallet } = require('ethers')
const { getAddress } = require('ethers/utils')
const moment = require('moment-timezone')

const { getChallenge, getToken } = require('./utils/colonyServer.service')

// #Skunkworks
const SKUNKWORKS_CHANNEL = process.env.SKUNKWORKS_DISCORD_CHANNEL

module.exports = robot => {
  const channel = robot.client.channels.cache.get(SKUNKWORKS_CHANNEL)

  async function getMessage() {
    // Use software wallet for members requests
    const wallet = await Wallet.createRandom()

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
        colonyMetricsDailies(first: 60, orderBy: date, orderDirection: desc) {
          id
          date
          colonies
          newColonies
          domains
          totalTokens
          totalUnlockedTokens
          totalFeesCount
        }
        colonyMetrics(id: 1) {
          id
          colonies
          domains
          totalTokens
          totalUnlockedTokens
          totalFeesCount
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
    const latestColoniesObj = metricsOutput.data.colonyMetricsDailies.find(daily => daily.colonies > 0)
    const latestColonies = latestColoniesObj.colonies
    const thirtyDayColonies = metricsOutput.data.colonyMetricsDailies[29].colonies
    const sixtyDayColonies = metricsOutput.data.colonyMetricsDailies[59].colonies
    const diffThirtyDayColonies = latestColonies - thirtyDayColonies
    const diffSixtyDayColonies = thirtyDayColonies - sixtyDayColonies

    // This could probably be improved
    const newColoniesAvg = avgValue(metricsOutput.data.colonyMetricsDailies.slice(0, 29), "newColonies")
    const prevNewColoniesAvg = avgValue(metricsOutput.data.colonyMetricsDailies.slice(30, 59), "newColonies")

    // Calculate colony outgoing transactions metrics
    const thirtyDayOutgoing = metricsOutput.data.colonyMetricsDailies
                                .slice(0, 29)
                                .reduce((prev, curr) => prev + Number(curr.totalFeesCount), 0)
    const sixtyDayOutgoing = metricsOutput.data.colonyMetricsDailies
                              .slice(30, 59)
                              .reduce((prev, curr) => prev + Number(curr.totalFeesCount), 0)

    // Get all colony addresses
    const numQueries = Math.ceil(metricsOutput.data.colonyMetrics.colonies / 1000)
    const coloniesArr = []
    for (i = 0; i < numQueries; i++) {
      const queryParameters = `first: 1000, skip: ${i * 1000}`
      const coloniesQuery = fetch(colonyMetrics, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({"query": `{
          colonies(${queryParameters}) {
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

    // Get most active Colonies by recent transaction activity
    // Get Colony main SubGraph
    const colonySubgraphMetrics = "https://xdai.colony.io/graph/subgraphs/name/joinColony/subgraph"
    // Get key OneTxPayments
    const subgraphRes = fetch(colonySubgraphMetrics, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({"query": `{
        oneTxPayments(first: 1000, orderBy: timestamp, orderDirection: desc) {
          id
          payment {
            to
            fundingPot {
              fundingPotPayouts {
                id
                token {
                  address: id
                  symbol
                  decimals
                }
                amount
              }
            }
          }
          timestamp
        }}` ,"variables":{}})
    })
      .then(response => response.json())
      .then(data => {
        return data
      })
      .catch((e) => {
        console.log(e)
      })

    const [subgraphOutput] = await Promise.all([subgraphRes])

    const transactionCount = subgraphOutput.data.oneTxPayments.reduce((allColonies, transaction) => {
      let colonyAddress = transaction.id.split("_")[0]
      const currCount = allColonies[colonyAddress] ? allColonies[colonyAddress] : 0
      return {
        ...allColonies,
        [colonyAddress]: currCount + 1,
      }
    }, {})

    const transactionCountSort = Object.entries(transactionCount).sort(([,a],[,b]) => b - a)
		const earliestTx = subgraphOutput.data.oneTxPayments[subgraphOutput.data.oneTxPayments.length - 1].timestamp
    const earliestTxTAgo = moment.unix(earliestTx).fromNow()
    const uniqueColonies = transactionCountSort.length

    // Get Colony name by address
    const topColonies = []
    for (let i = 0; i < 5; i++) {
      const colonyQuery = fetch(colonySubgraphMetrics, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({"query": `{
          colonies(where: {id: "${transactionCountSort[i][0]}"}) {
            id
            ensName
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

      const [colonyOutput] = await Promise.all([colonyQuery])
      topColonies.push({
        name: colonyOutput.data.colonies[0].ensName.split(".")[0],
        address: transactionCountSort[i][0],
        count: transactionCountSort[i][1]
      })
    }

    // Create the messages
    message += `**__Colony Metrics__**  ${getChangeIcon(diffThirtyDayColonies, diffSixtyDayColonies)}  \n\n`

    message += `> Total Colonies: **__${numFormat(metricsOutput.data.colonyMetrics.colonies)}__**\n`
    message += `> New colonies past 30 days: **__${numFormat(diffThirtyDayColonies)}__**`
    message += ` (**${changeDirection(diffThirtyDayColonies, diffSixtyDayColonies)}%** over previous 30 days)\n`
    message += `> 30 day new colonies avg.: **__${numFormat(newColoniesAvg)}__/day**`
    message += ` (**${changeDirection(newColoniesAvg, prevNewColoniesAvg)}%** previous average)\n\n`

    message += `> Total colony subscriptions: **__${numFormat(uniqueMembers.length)}__**\n`
    message += `> New subscriptions past 30 days: **__${numFormat(thirtyDayMembers)}__**`
    message += ` (**${changeDirection(thirtyDayMembers, sixtyDayMembers)}%** over previous 30 days)\n\n`

    message += `> Total outgoing transactions: **__${numFormat(metricsOutput.data.colonyMetrics.totalFeesCount)}__**\n`
    message += `> Outgoing transactions past 30 days: **__${numFormat(thirtyDayOutgoing)}__**`
    message += ` (**${changeDirection(thirtyDayOutgoing, sixtyDayOutgoing)}%** over previous 30 days)\n\n`

    message += `> Total new tokens created: **__${numFormat(metricsOutput.data.colonyMetrics.totalTokens)}__**\n\n`
    message += `> Total domains created: **__${numFormat(metricsOutput.data.colonyMetrics.domains)}__**\n\n`

    message += `> Motions & Disputes: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].installs)}__** Installs`
    message += ` & **__${numFormat(metricsOutput.data.votingReputationExtensions[0].uninstalled)}__** Uninstalls\n`
    message += `> Total Motions created: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].motions)}__**\n`
    message += `> Total Stakes: **__${numFormat(metricsOutput.data.votingReputationExtensions[0].motionsStaked)}__**\n\n`

    message += `> Number of active Colonies in past ${earliestTxTAgo.replace(' ago', '')}: **__${numFormat(uniqueColonies)}__**\n`
    message += `> Top 5 active Colonies in past ${earliestTxTAgo.replace(' ago', '')}:\n`
    topColonies.map((colony) => {
      return message += `>  • https://xdai.colony.io/colony/${colony.name}: **__${numFormat(colony.count)}__** transactions (${colony.address})\n`
    })

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
