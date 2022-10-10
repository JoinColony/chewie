const { prHelpers } = require('./utils/prs.js')
const CronJob = require('cron').CronJob
require('dotenv').config()

const processUnreviewedPrs = async robot => {
  const threshold = 3 // number of days since review requested
  const roomId = process.env.HUBOT_DISCORD_DEV_CHANNEL
  const { getPRs, getPRsWithoutReviews } = prHelpers(robot)
  let response = `The following PRs have not been reviewed in over ${threshold} days:\n`

  const prs = await getPRs()
  // The following PRs issued a review request over x days ago and still have no reviews:
  const prsWithoutReviews = await getPRsWithoutReviews(prs, threshold)
  if (prsWithoutReviews.length) {
    prsWithoutReviews.forEach(pr => {
      response += `**PR #${pr.number}:** ${pr.title} <${pr['html_url']}>\n`
    })
    robot.messageRoom(roomId, response.trim())
  }
}

const setupCronJob = robot => {
  const job = new CronJob({
    // Every weekday 08:30h London
    cronTime: '00 30 08 * * 1-5',
    onTick: () => {
      processUnreviewedPrs(robot)
    },
    start: false,
    timeZone: 'Europe/London'
  })
  job.start()
}

module.exports = function(robot) {
  setupCronJob(robot)
}
