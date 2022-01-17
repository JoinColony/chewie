// Description:
//   Daily standup public shaming
//   TODO
//
// Dependencies:
//   'cron': '1.3.x'
//
// Configuration:
//
// Commands:
//   adduser - Add user to daily standup list
//
// Author:
//   chmanie

const CronJob = require('cron').CronJob

const {
  getOffsetDate,
  getOffsetDay,
  getOffsetHour,
  getCurrentDateForUser,
  getCurrentDayForUser,
  getCurrentTimeForUser,
  dateIsInRange,
  dateIsOlderThan,
  parseNaturalDate,
} = require('./utils/dates');

const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');

const getBrain = require('./utils/brain');

const getTimezoneFromMap = getBrain('timezones').getFromMap

const BRAIN_PREFIX = 'standup-discord';
// This is the daily-standup channel. This should be an env variable at some point
const HUBOT_STANDUP_CHANNEL = '718537795068625036';
// #Skunkworks
// const HUBOT_STANDUP_CHANNEL = '720952130562687016';

const {
  addToMap,
  getFromMap,
  getMap,
  removeFromMap,
  removeMap,
  setMap,
  updateMap,
} = getBrain(BRAIN_PREFIX);

/* User permission helpers */
const getUser = (userId, brain) => {
  return getFromMap('standuppers', userId, brain)
}

const addUserWithRole = (user, role, brain) => {
  return addToMap(`${role}s`, user.id, user, brain)
}

// Returns true if no admins exist yet
const noAdmins = brain => {
  const admins = getMap('admins', brain)
  if (!Object.keys(admins).length) {
    return true
  }
  return false
}

const isAdmin = (user, brain) => {
  const admins = getMap('admins', brain)
  return !!admins[user.id]
}

const isStandupper = (user, brain) => {
  const standuppers = getMap('standuppers', brain)
  return !!standuppers[user.id]
}

const getUserList = (map, brain) => {
  const users = getMap(map, brain)
  return Object.values(users)
    .map(user => `• ${getUserName(user, brain)} (${user.id})`)
    .join('\n')
}

const getUserName = (userToFind, brain) => {
  const user = brain.userForId(userToFind.id)
  return user ? user.name : userToFind.id
}

const userHasToWorkToday = (user, day) =>
  user.workDays[0] <= day && user.workDays[1] >= day

const nobodyHadToWorkToday = (users, day) => {
  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    if (user && userHasToWorkToday(user, day)) {
      return false
    }
  }
  return true
}

const isUserExcusedToday = (user, date, brain) => {
  const map = getMap(`excuses-${user.id}`, brain)
  const excuses = Object.keys(map)
  for (let i = 0; i < excuses.length; i++) {
    if (excuses[i] === date) return true
    if (excuses[i].includes('>') && dateIsInRange(date, excuses[i])) return true
  }
  return false
}

const hasUserDoneAStandupToday = (user, date, brain) => {
  const standups = getMap(date, brain)
  return Object.keys(standups).indexOf(user.id) > -1
}

const hasUserDoneAStandupInTimeToday = (user, date, brain) => {
  const standups = getMap(date, brain)
  return !!(standups[user.id] && standups[user.id] < 12)
}

// Generates and returns the leaderboard. If rerank is passed as true, the users'q most-recent-official-rankings
// will be updated.
const getLeaderboard = (rerank, brain) => {
  const standuppers = Object.values(getMap('standuppers', brain)).sort(
    (a, b) => b.currentCount - a.currentCount
  )
  let rank = 1
  let output = '**Number of standups since each person last missed one**\n'
  let rankScore = standuppers[0].currentCount
  let nProcessed = 0
  standuppers.forEach(user => {
    nProcessed += 1
    if (rankScore != user.currentCount) {
      rank = nProcessed
      rankScore = user.currentCount
      output += '=============================\n'
    }
    const lastOfficialRank = user.lastOfficialRank
    let movement
    if (!lastOfficialRank) {
      movement = '*️⃣'
    } else if (lastOfficialRank > rank) {
      movement = '🔼'
    } else if (lastOfficialRank == rank) {
      movement = '▶️'
    } else {
      movement = '🔽'
    }
    output += `${rank}. ${movement}  ${getUserName(user, brain)} -- ${
      user.currentCount
    }\n`
    if (rerank) {
      user.lastOfficialRank = rank
      updateMap('standuppers', user.id, user, brain)
    }
  })

  return output
}

const checkStandupsDone = robot => {
  const { brain } = robot
  const date = getOffsetDate(-11)
  const day = getOffsetDay(-11)
  const standuppers = Object.values(getMap('standuppers', brain))
  const channel = robot.client.channels.cache.get(HUBOT_STANDUP_CHANNEL)

  if (nobodyHadToWorkToday(standuppers, day)) {
    return channel.send(
      'Yesterday was a free day for everyone! Hope you enjoyed it 🏝'
    )
  }

  const usersToShame = standuppers
    // The workdays have to be connected (i.e. not separated by a weekend), for now
    // Users who had to post a standup today
    .filter(user => userHasToWorkToday(user, day))
    // Users who are not excused for today
    .filter(user => !isUserExcusedToday(user, date, brain))
    // Users who have not posted a standup
    .filter(user => !hasUserDoneAStandupToday(user, date, brain))

  if (!usersToShame.length) {
    const praises = Object.values(getMap('praises', brain))
    const randomIdx = Math.floor(Math.random() * praises.length)
    const randomPraise = praises[randomIdx]
    channel.send(
      `Everyone did their standups yesterday! ${randomPraise ||
        'That makes me a very happy Wookiee!'}`
    )
  } else {
    const phrases = Object.values(getMap('phrases', brain))
    const randomIdx = Math.floor(Math.random() * phrases.length)
    const randomPhrase = phrases[randomIdx]
    if (usersToShame.length === 1) {
      channel.send(
        `Only <@${usersToShame[0].id}> forgot to do their standup yesterday. ${randomPhrase}`
      )
    } else {
      const displayUsers = usersToShame.slice()
      const lastUser = displayUsers.pop()
      channel.send(
        displayUsers.map(user => `<@${user.id}>`).join(', ') +
          ` and <@${lastUser.id}> did not do their standups yesterday. ${randomPhrase}`
      )
    }
  }

  // Zero users that deserve it on the leaderboard.
  usersToShame.forEach(user => {
    user.currentCount = 0
    if (user.allTimeMissed) {
      user.allTimeMissed += 1
    } else {
      user.allTimeMissed = 1
    }
    updateMap('standuppers', user.id, user, brain)
  })

  const usersToIncrementOnLeaderboard = standuppers
    // Users who had to post a standup today
    .filter(user => userHasToWorkToday(user, day))
    // Users who have posted a standup or are excused are incremented
    .filter(
      user =>
        hasUserDoneAStandupInTimeToday(user, date, brain) ||
        isUserExcusedToday(user, date, brain)
    )
    .forEach(user => {
      if (!user.currentCount) {
        user.currentCount = 1
        user.personalBest = 1
        user.allTimeCount = 1
        user.allTimeMissed = 0
      } else {
        user.currentCount += 1
        user.allTimeCount += 1
        if (!user.personalBest || user.currentCount > user.personalBest) {
          user.personalBest = user.currentCount
        }
      }
      updateMap('standuppers', user.id, user, brain)
    })
}

const cleanUpExcuses = robot => {
  const { brain } = robot
  const today = getOffsetDate(-11)
  const standuppers = Object.keys(getMap('standuppers', brain))
  standuppers.forEach(userId => {
    const excuses = Object.keys(getMap(`excuses-${userId}`, brain))
    excuses.forEach(excuse => {
      if (dateIsOlderThan(excuse, today)) {
        removeFromMap(`excuses-${userId}`, excuse, brain)
      }
    })
  })
}

const setupCronJob = robot => {
  const job = new CronJob({
    // Every weekday 23:45h
    cronTime: '00 45 23 * * *',
    onTick: () => {
      checkStandupsDone(robot)
      cleanUpExcuses(robot)
    },
    start: false,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  })
  job.start()

  const leaderboardJob = new CronJob({
    // Every sunday at 23:46h, in Pacific/Niue - monday for most people.
    cronTime: '0 46 23 * * 0',
    onTick: () => {
      const leaderboard = getLeaderboard(true, robot.brain)
      const channel = robot.client.channels.cache.get(HUBOT_STANDUP_CHANNEL)
      channel.send(leaderboard)
    },
    start: false,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  })
  leaderboardJob.start()
}

module.exports = robot => {
  const { brain } = robot
  const channel = robot.client.channels.cache.get(HUBOT_STANDUP_CHANNEL)

  setupCronJob(robot)

  // These lines are for debugging. Please leave in and commented for now
  // let done = false
  // brain.on('loaded', () => {
  //   if (done) return
  //   brain.remove(`${BRAIN_PREFIX}-admins`)
  //   brain.remove(`${BRAIN_PREFIX}-standuppers`)
  //   const date = getOffsetDate(0)
  //   brain.remove(`${BRAIN_PREFIX}-${date}`)
  //   done = true
  // })

  const listenAddPhrase = (kind, res) => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    addToMap(`${kind}s`, null, res.match[1], brain)
    res.send(`OK, I've added this ${kind}`)
  }

  const listenListPhrases = (kind, res) => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    const map = getMap(`${kind}s`, brain)
    const phrases = Object.entries(map).map(
      ([key, phrase]) => `${key} - "${phrase}"`
    )
    if (!phrases.length) {
      return res.send(`No amusing ${kind}s found`)
    }
    res.send(
      `I will pick one of the following amusing ${kind}s randomly:\n${phrases.join(
        '\n'
      )}`
    )
  }

  const listenRemovePhrase = (kind, res) => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    removeFromMap(`${kind}s`, res.match[1], brain)
    res.send(`OK, I removed the ${kind} with id ${res.match[1]}`)
  }

  robot.hear(/standup add ([0-6])-([0-6])/, async res => {
    const { message, match } = res
    if (!isPrivateDiscordMessage(robot.client, res)) return
    const zone = getTimezoneFromMap('users', message.user.id, robot.brain);
    if (zone == null) {
      return res.send('Please set your time zone via a PM to me using the `!timezone set <Timezone>` command first')
    }
    const user = {
      id: message.user.id,
      workDays: [parseInt(match[1], 10), parseInt(match[2], 10)],
      currentCount: 1,
      personalBest: 1,
      allTimeCount: 1,
      allTimeMissed: 0
    }
    if (addUserWithRole(user, 'standupper', brain)) {
      res.send(
        `I added you to the daily-standup list! Hoping for you to not forget to post it 🤞🏽`
      )
    } else {
      res.send(
        `You were already on the list! But thanks for letting me know again!`
      )
    }
  })

  robot.hear(/standup admin add (.+)/, res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return
    const userToAdd =
      res.match[1] === 'me' ? user : getUser(res.match[1], brain)
    if (userToAdd && addUserWithRole(userToAdd, 'admin', brain)) {
      return res.send(
        `I added ${getUserName(userToAdd, brain)} as an admin. Have fun!`
      )
    }
    return res.send(
      'Could not add user as an admin. Maybe they do not exist or are already admin?'
    )
  })

  robot.hear('standup admin standup list', res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    const date = getCurrentDateForUser(robot.client, res.message.user)
    const standups = getMap(date, brain)
    const users = getMap('standuppers', brain)
    const mapKeyToUser = key =>
      users[key] ? getUserName(users[key], brain) : key
    const msg = `Standups today: ${Object.keys(standups)
      .map(mapKeyToUser)
      .join(', ')}`
    res.send(msg)
  })

  robot.hear('standup admin user list', res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    const msg = `Standuppers:\n${getUserList(
      'standuppers',
      brain
    )}\nAdmins:\n${getUserList('admins', brain)}`
    res.send(msg)
  })

  robot.hear(/standup admin user remove (.+)/, res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    const userId = res.match[1]
    removeFromMap('standuppers', userId, brain)
    removeMap(`excuses-${userId}`, brain)
    res.send(`User with id ${userId} removed`)
  })

  robot.hear(
    /standup admin phrase add (.+)/,
    listenAddPhrase.bind(this, 'phrase')
  )
  robot.hear(
    /standup admin praise add (.+)/,
    listenAddPhrase.bind(this, 'praise')
  )

  robot.hear(
    'standup admin phrase list',
    listenListPhrases.bind(this, 'phrase')
  )
  robot.hear(
    'standup admin praise list',
    listenListPhrases.bind(this, 'praise')
  )

  robot.hear(
    /standup admin phrase remove (\d+)/,
    listenRemovePhrase.bind(this, 'phrase')
  )
  robot.hear(
    /standup admin praise remove (\d+)/,
    listenRemovePhrase.bind(this, 'praise')
  )

  // At least 3 bold lines with another line following that
  robot.hear(/(\*\*.+?\*\*.*(\r\n|\r|\n)(.*(\r\n|\r|\n))*?){3,}/, async (res) => {
    const { user } = res.message
    if (!isChannel(res, HUBOT_STANDUP_CHANNEL) || !isStandupper(user, brain)) {
      return
    }
    const date = getCurrentDateForUser(robot, user.id)
    const hour = getCurrentTimeForUser(robot, user.id)
    const day = getCurrentDayForUser(robot, user.id)
    const standupper = getFromMap('standuppers', user.id, brain)

    if (hour >= 12 && userHasToWorkToday(standupper, day)) {
      res.send(
        `It is a bit late to post your standup, <@${user.id}>, please try to do it before noon your time.`
      )
    }

    addToMap(date, res.message.user.id, hour, brain)
    const channel = robot.client.channels.cache.find(x => x.id == res.message.room)
    const message = await channel.messages.fetch(res.message.id)
    message.react(":chewie:719957751316611172")
  })

  robot.hear(/[sS]tandup excuse add (.+)/, res => {
    const { user } = res.message
    if (isPrivateDiscordMessage(robot.client, res)) {
      return res.send(
        'An excuse has to be publicly requested in the standup channel'
      )
    }
    if (!isChannel(res, HUBOT_STANDUP_CHANNEL) || !isStandupper(user, brain)) {
      return
    }
    const excuseDateStr = parseNaturalDate(res.match[1], user.id, robot)
    addToMap(`excuses-${user.id}`, excuseDateStr, true, brain)
    res.send(`OK, you will be excused at ${excuseDateStr}`)
  })

  robot.hear(/standup excuse remove ([\d\->]+)/, res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isStandupper(user, brain)) return
    removeFromMap(`excuses-${user.id}`, res.match[1], brain)
    res.send(`OK, I removed this excuse: ${res.match[1]}`)
  })

  robot.hear('standup excuse list', res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isStandupper(user, brain)) return
    const map = getMap(`excuses-${user.id}`, brain)
    const excuses = Object.keys(map).map(excuse => `• ${excuse}`)
    if (!excuses.length) {
      return res.send('No excuses found! 🤙')
    }
    res.send(
      `OK, here's a list of all the days where you don't need to do your standup:\n${excuses.join(
        '\n'
      )}`
    )
  })

  // These lines are for debugging. Please leave in and commented for now
  robot.hear('blame', res => {
    if (!isPrivateDiscordMessage(robot.client, res)) return
    checkStandupsDone(robot)
    cleanUpExcuses(robot)
  })

  robot.hear('standup leaderboard', res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isStandupper(user, brain)) return
    const output = getLeaderboard(false, brain)
    res.send(output)
  })

  robot.hear(/standup admin leaderboard reset (.+)/, res => {
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res) || !isAdmin(user, brain)) return
    const standuppers = Object.values(getMap('standuppers', brain))
    standuppers
      .filter(user => getUserName(user, brain) == res.match[1])
      .forEach(user => {
        user.currentCount = 0
        updateMap('standuppers', user.id, user, brain)
      })
    res.send("It's like they never did a standup (or more accurately, it's like they missed yesterday).");
  })
}
