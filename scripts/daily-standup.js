// Description:
//   Daily standup public shaming
//   TODO
//
// Dependencies:
//   'axios': '0.18.x'
//
// Configuration:
//
// Commands:
//   adduser - Add user to daily standup list
//
// Author:
//   chmanie

const axios = require('axios')

const BRAIN_PREFIX = 'standup'
const { HUBOT_STANDUP_CHANNEL, HUBOT_SLACK_TOKEN } = process.env

// A few redis helpers
const getMap = (key, brain) => {
  return JSON.parse(brain.get(`${BRAIN_PREFIX}-${key}`)) || {}
}

const setMap = (key, value, brain) => {
  return brain.set(`${BRAIN_PREFIX}-${key}`, JSON.stringify(value))
}

const addToMap = (mapKey, key, value, brain) => {
  const map = getMap(mapKey, brain)
  if (map[key]) {
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

// Chat message helpers
const isPrivateSlackMessage = res => res.message.room.startsWith('D')
const isShellMessage = res => res.message.room === 'Shell'
const isChannel = (res, channelId) => res.message.room === channelId

// Date helpers
const getUserTimezone = async user => {
  const res = await axios.get(
    `https://slack.com/api/users.info?token=${HUBOT_SLACK_TOKEN}&user=${
      user.id
    }`
  )
  return res.data.user.tz_offset / (60 * 60)
}

// Returns the current date for a specific user
const getCurrentDate = async user => {
  const offset = await getUserTimezone(user)
  const d = new Date(Date.now() + offset * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
}

// User permission helpers
const getUser = (userId, brain) => {
  return getFromMap('users', userId, brain)
}

const addUserWithRole = (user, role, brain) => {
  return addToMap(`${role}s`, user.id, user, brain)
}

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

const getUserList = map => {
  return Object.values(map)
    .map(user => `• ${user.name} (${user.id})`)
    .join('\n')
}

module.exports = robot => {
  const { brain } = robot
  // FIXME: remove these lines
  let done = false
  brain.on('loaded', () => {
    if (done) return
    brain.remove(`${BRAIN_PREFIX}-admins`, '{}')
    brain.remove(`${BRAIN_PREFIX}-standuppers`, '{}')
    done = true
  })

  robot.hear('standup add', async res => {
    if (!isPrivateSlackMessage(res) && !isShellMessage(res)) return
    const timezoneOffset = await getUserTimezone(res.message.user)
    if (timezoneOffset == null) {
      return res.send('Please set your time zone in slack first')
    }
    if (addUserWithRole(res.message.user, 'standupper', brain)) {
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
    if (!isPrivateSlackMessage(res) && !isShellMessage(res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return
    const userToAdd =
      res.match[1] === 'me' ? user : getUser(res.match[1], brain)
    if (userToAdd && addUserWithRole(userToAdd, 'admin', brain)) {
      return res.send(`I added ${user.name} as an admin. Have fun!`)
    }
    return res.send(
      'Could not add user as an admin. Maybe they do not exist or are already admin?'
    )
  })

  robot.hear('standup admin standups', async res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) && !isShellMessage(res)) return
    if (!isAdmin(user, brain)) return
    const date = await getCurrentDate(res.message.user)
    const standups = getMap(date, brain)
    const users = getMap('standuppers', brain)
    const mapKeyToUser = key => (users[key] ? users[key].name : key)
    const msg = `Standups today: ${Object.keys(standups)
      .map(mapKeyToUser)
      .join(', ')}`
    res.send(msg)
  })

  robot.hear('standup admin users', res => {
    const { user } = res.message
    if (!isPrivateSlackMessage(res) && !isShellMessage(res)) return
    if (!isAdmin(user, brain)) return
    const standuppers = getMap('standuppers', brain)
    const admins = getMap('admins', brain)

    const msg = `Standuppers:\n${getUserList(
      standuppers
    )}\nAdmins:\n${getUserList(admins)}`
    res.send(msg)
  })

  // robot.hear(/.+/, async res => {
  //   const { user } = res.message
  //   if (!isChannel(res, HUBOT_STANDUP_CHANNEL)) return
  //   if (!isStandupper(user, brain)) return
  //   const date = await getCurrentDate(user)
  //   addToMap(date, res.message.user.id, true, brain)
  // })
}
