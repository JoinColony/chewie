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
const chrono = require('chrono-node')

const BRAIN_PREFIX = 'standup'
// This is the standup-testing channel. This should be an env variable at some point
const HUBOT_STANDUP_CHANNEL = 'C0NFZA7T5'

/* A few redis helpers */
const getMap = (key, brain) => {
  return JSON.parse(brain.get(`${BRAIN_PREFIX}-${key}`)) || {}
}

const setMap = (key, value, brain) => {
  return brain.set(`${BRAIN_PREFIX}-${key}`, JSON.stringify(value))
}

const removeMap = (key, brain) => {
  return brain.remove(`${BRAIN_PREFIX}-${key}`)
}

const addToMap = (mapKey, key, value, brain) => {
  const map = getMap(mapKey, brain)
  // Use incremental number if no key is given
  key = key || Object.keys(map).length + 1
  if (map[key]) {
    return false
  }
  map[key] = value
  setMap(mapKey, map, brain)
  return true
}

const updateMap = (mapKey, key, value, brain) => {
  const map = getMap(mapKey, brain)
  if (!key || !map[key]) {
    return false
  }
  map[key] = value
  setMap(mapKey, map, brain)
  return true
}

const getFromMap = (mapKey, key, brain) => {
  const map = getMap(mapKey, brain)
  return map[key]
}

const removeFromMap = (mapKey, key, brain) => {
  const map = getMap(mapKey, brain)
  delete map[key]
  setMap(mapKey, map, brain)
}

/* Chat message helpers */
const isPrivateSlackMessage = res => res.message.room.startsWith('D')
const isChannel = (res, channelId) => res.message.room === channelId

/* Date helpers */
const getOffsetDate = (offset, timestamp = Date.now()) => {
  const d = new Date(timestamp + offset * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}

const getOffsetDay = offset => {
  const d = new Date(Date.now() + offset * 60 * 60 * 1000)
  return d.getUTCDay()
}

// Returns the current date for a specific user
const getCurrentDateForUser = user => {
  const offset = user.slack.tz_offset / (60 * 60)
  return getOffsetDate(offset)
}

const dateIsInRange = (dateStr, rangeStr) => {
  const range = rangeStr.split('>')
  const date = new Date(dateStr)
  const start = new Date(range[0])
  const end = new Date(range[1])
  return start <= date && date <= end
}

const dateIsOlderThan = (dateOrRangeStr, refDate) => {
  const date = dateOrRangeStr.includes('>')
    ? dateOrRangeStr.split('>')[1]
    : dateOrRangeStr
  return new Date(date) <= new Date(refDate)
}

const parseNaturalDate = (expr, user) => {
  const referenceDate = new Date(`${getCurrentDateForUser(user)} 11:00Z`)
  const parsed = chrono.parse(expr, referenceDate, { forwardDate: true })
  const { start } = parsed[0]
  let end
  if (parsed.length == 2) {
    end = parsed[1].start
  } else {
    end = parsed[0].end
  }
  const dateStart = `${start.get('year')}-${start.get('month')}-${start.get(
    'day'
  )}`
  if (end) {
    const dateEnd = `${end.get('year')}-${end.get('month')}-${end.get('day')}`
    return `${dateStart}>${dateEnd}`
  }
  return dateStart
}

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

const checkStandupsDone = robot => {
  const { brain } = robot
  const date = getOffsetDate(-11)
  const day = getOffsetDay(-11)
  const standuppers = Object.values(getMap('standuppers', brain))
  const usersToShame = standuppers
    // The workdays have to be connected (i.e. not separated by a weekend), for now
    // Users who had to post a standup today
    .filter(user => user.workDays[0] <= day && user.workDays[1] >= day)
    // Users who are not excused for today
    .filter(user => !isUserExcusedToday(user, date, brain))
    // Users who have not posted a standup
    .filter(user => !hasUserDoneAStandupToday(user, date, brain))
  const phrases = Object.values(getMap('phrases', brain))
  const randomIdx = Math.floor(Math.random() * phrases.length)
  const randomPhrase = phrases[randomIdx]
  if (!usersToShame.length) {
    return robot.messageRoom(
      HUBOT_STANDUP_CHANNEL,
      'Everyone did their standups yesterday! That makes me a very happy Wookiee!'
    )
  }
  if (usersToShame.length === 1) {
    return robot.messageRoom(
      HUBOT_STANDUP_CHANNEL,
      `Only @${getUserName(
        usersToShame[0],
        brain
      )} forgot to do their standup yesterday. ${randomPhrase}`
    )
  }
  const lastUser = usersToShame.pop()
  robot.messageRoom(
    HUBOT_STANDUP_CHANNEL,
    usersToShame.map(user => `@${getUserName(user, brain)}`).join(', ') +
      ` and @${getUserName(
        lastUser,
        brain
      )} did not do their standups yesterday. ${randomPhrase}`
  )

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
    .filter(user => user.workDays[0] <= day && user.workDays[1] >= day)
    // Users who are not excused for today
    .filter(user => !isUserExcusedToday(user, date, brain))
    // Users who have posted a standup
    .filter(user => hasUserDoneAStandupToday(user, date, brain))
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

const cleanUpExcuses = brain => {
  const today = getOffsetDate(0)
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

const setupCronJob = brain => {
  const job = new CronJob({
    // Every weekday 23:45h
    cronTime: '00 45 23 * * 1-5',
    onTick: () => {
      checkStandupsDone(brain)
      cleanUpExcuses(brain)
    },
    start: false,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  })
  job.start()
}

module.exports = robot => {
  const { brain, messageRoom } = robot
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

  robot.hear(/standup add ([1-5])-([1-5])/, async res => {
    const { message, match } = res
    if (!isPrivateSlackMessage(res)) return
    if (message.user.slack.tz_offset == null) {
      return res.send('Please set your time zone in slack first')
    }
    const user = {
      id: message.user.id,
      workDays: [parseInt(match[1], 10), parseInt(match[2], 10)],
      currentCount: 1,
      personalBest: 1,
      allTimeCount: 1,
      allTimeMissed: 0,
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
    if (!isPrivateSlackMessage(res)) return
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
    if (!isPrivateSlackMessage(res) || !isAdmin(user, brain)) return
    const date = getCurrentDateForUser(res.message.user)
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
    if (!isPrivateSlackMessage(res) || !isAdmin(user, brain)) return
    const msg = `Standuppers:\n${getUserList(
      'standuppers',
      brain
    )}\nAdmins:\n${getUserList('admins', brain)}`
    res.send(msg)
  })

  robot.hear(/standup admin user remove (.+)/, res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) || !isAdmin(user, brain)) return
    const userId = res.match[1]
    removeFromMap('standuppers', userId)
    removeMap(`excuses-${userId}`)
    res.send(`User with id ${userId} removed`)
  })

  robot.hear(/standup admin phrase add (.+)/, res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) || !isAdmin(user, brain)) return
    addToMap('phrases', null, res.match[1], brain)
    res.send('OK, I added this phrase')
  })

  robot.hear('standup admin phrase list', res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) || !isAdmin(user, brain)) return
    const map = getMap('phrases', brain)
    const phrases = Object.entries(map).map(
      ([key, phrase]) => `${key} - "${phrase}"`
    )
    if (!phrases.length) {
      return res.send('No amusing scornful remarks found')
    }
    res.send(
      `I will pick one of the following amusing scornful remarks randomly:\n${phrases.join(
        '\n'
      )}`
    )
  })

  robot.hear(/standup admin phrase remove (\d+)/, res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) || !isAdmin(user, brain)) return
    removeFromMap('phrases', res.match[1], brain)
    res.send(`OK, I removed the phrase with id ${res.match[1]}`)
  })

  // At least 3 bold lines with another line following that
  robot.hear(/(\*.+?\*.*(\r\n|\r|\n)(.*(\r\n|\r|\n))*?){3,}/, res => {
    const { user } = res.message
    if (!isChannel(res, HUBOT_STANDUP_CHANNEL) || !isStandupper(user, brain)) {
      return
    }
    const date = getCurrentDateForUser(user)
    addToMap(date, res.message.user.id, true, brain)
    robot.emit('slack.reaction', { message: res.message, name: 'chewie' })
  })

  robot.hear(/standup excuse add (.+)/, res => {
    const { user } = res.message
    if (isPrivateSlackMessage(res)) {
      return res.send(
        'An excuse has to be publicly requested in the standup channel'
      )
    }
    if (!isChannel(res, HUBOT_STANDUP_CHANNEL) || !isStandupper(user, brain)) {
      return
    }
    const excuseDateStr = parseNaturalDate(res.match[1], user)
    addToMap(`excuses-${user.id}`, excuseDateStr, true, brain)
    res.send(`OK, you will be excused at ${excuseDateStr}`)
  })

  robot.hear(/standup excuse remove ([\d\->]+)/, res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) || !isStandupper(user, brain)) return
    removeFromMap(`excuses-${user.id}`, res.match[1], brain)
    res.send(`OK, I removed this excuse: ${res.match[1]}`)
  })

  robot.hear('standup excuse list', res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) || !isStandupper(user, brain)) return
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
  // robot.hear('blame', res => {
  //   if (!isPrivateSlackMessage(res)) return
  //   checkStandupsDone(robot)
  //   cleanUpExcuses(robot.brain)
  // })

  robot.hear('standup leaderboard', res => {
    if (!isPrivateSlackMessage(res)) return
    const standuppers = Object.values(getMap('standuppers', brain)).sort(
      (a, b) => a.currentCount < b.currentCount
    )
    let rank = 1
    let output = '*Number of days without missing a standup*\n'
    let rankScore = standuppers[0].currentCount
    standuppers.forEach(user => {
      if (rankScore != user.currentCount) {
        rank += 1
        rankScore = user.currentCount
      }
      output += `${rank}. ${getUserName(user, brain)} -- ${user.currentCount}\n`
    })
    res.send(output)
  })
}
