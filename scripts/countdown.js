// Description:
//   Create countdown timers
//
// Dependencies:
//   'cron': '1.3.x'
//
// Configuration:
//
// Commands:
//   countdown add 'My title' 2019-04-07
//     Add an event with a title and a due date
//   countdown status
//     Send messages for all current countdowns
//   countdown remove 'My title'
//     Remove the given countdown (only the creator can run this)
//
// Author:
//   JamesLefrere

const CronJob = require('cron').CronJob

const getBrain = require('./utils/brain')

const { getOffsetDate, parseNaturalDate } = require('./utils/dates')

const { isPrivateSlackMessage } = require('./utils/channels')

const BRAIN_PREFIX = 'countdown'
const COUNTDOWNS = 'countdowns'

const { addToMap, getFromMap, getMap, removeFromMap } = getBrain(BRAIN_PREFIX)

const getSass = hours => {
  if (hours > 24 * 7 * 4) return 'An ocean of time.'
  if (hours > 24 * 7 * 3.5) return 'Ages, mate.'
  if (hours > 24 * 7 * 3) return `It's getting closer, but it'll be fine.`
  if (hours > 24 * 7 * 2.5) return 'Watch out for this one.'
  if (hours > 24 * 7 * 2) return 'Did you try working faster?'
  if (hours > 24 * 7 * 1.5) return `That's concerning.`
  if (hours > 24 * 7) return `That's quite soon if you think about it.`
  if (hours > 24 * 6) return `Well that doesn't sound right...`
  if (hours > 24 * 5) return 'A week?! A mere working week?!'
  if (hours > 24 * 4) return 'Shit, we can do it!'
  if (hours > 24 * 3) return 'A'.repeat(20)
  if (hours > 24 * 2) return `I'll give you 1 ETH if you finish it today.`
  if (hours > 24) return `*${'A'.repeat(200)}*`
  return '*PANIC MODE ENGAGE!!!* gogogogogogogogogogogogogo54321111111glhf'
}

const getKey = title => title.replace(/\s/g, '')

const processCountdowns = robot => {
  const { brain } = robot
  const currentDate = getOffsetDate(-11)

  Object.entries(getMap(COUNTDOWNS, brain)).forEach(
    ([key, { title, dueDate, room }]) => {
      const diff = new Date(dueDate).getTime() - new Date(currentDate).getTime()

      if (diff < 0) {
        robot.messageRoom(room, `${title}: due date elapsed!`)
        return removeFromMap(COUNTDOWNS, key, brain)
      }

      const hours = (diff / (1000 * 60 * 60)).toFixed(2)

      robot.messageRoom(
        room,
        `${title}: ${hours} hours remaining. ${getSass(hours)}`
      )
    }
  )
}

const setupCronJob = robot => {
  const job = new CronJob({
    // Every weekday 23:45h
    cronTime: '00 45 23 * * *',
    onTick: () => {
      processCountdowns(robot)
    },
    start: false,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  })
  job.start()
}

module.exports = robot => {
  const { brain } = robot
  setupCronJob(robot)

  robot.hear(/^countdown add '(.+)' (.+)$/, res => {
    const {
      message: { user, room },
      match
    } = res

    if (isPrivateSlackMessage(res)) {
      return res.send('Countdowns can only be added in a channel.')
    }

    if (user.slack.tz_offset == null) {
      return res.send('Please set your time zone in slack first')
    }

    const title = match[1]
    const dueDate = parseNaturalDate(match[2], user)

    const key = getKey(title)
    const existing = getFromMap(COUNTDOWNS, key, brain)

    if (existing) {
      return res.send('Oops, a countdown with that title already exists')
    }

    addToMap(COUNTDOWNS, key, { title, dueDate, room, userId: user.id }, brain)

    return res.send('The countdown begins!')
  })

  robot.hear(/^countdown status$/, () => {
    processCountdowns(robot)
  })

  robot.hear(/^countdown remove '(.*)'$/, res => {
    const {
      message: { user },
      match
    } = res

    const key = getKey(match[1])
    const existing = getFromMap(COUNTDOWNS, key, brain)

    if (!existing) {
      return res.send(`That countdown doesn't exist`)
    }

    if (user.id !== existing.userId) {
      return res.send(`Only user ID ${userId} can remove that countdown`)
    }

    removeFromMap(COUNTDOWNS, key, brain)

    return res.send('Countdown removed')
  })
}
