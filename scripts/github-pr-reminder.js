const { prHelpers } = require('./utils/prs.js')
const CronJob = require('cron').CronJob
require('dotenv').config()

const processUnreviewedPrs = async robot => {
  const roomId = process.env.HUBOT_DISCORD_DEV_CHANNEL
  const messages = await getMessages(robot);
  messages.forEach((chunk) => robot.messageRoom(roomId, chunk.trim()));
}

const getMessages = async robot => {
  const threshold = 3 // number of days since review requested

  const { getPRs, getPRsWithoutReviews } = prHelpers(robot)
  let response = `The following PRs have not been reviewed in over ${threshold} days:\n`
  const prs = await getPRs()
  // The following PRs issued a review request over x days ago and still have no reviews:
  const prsWithoutReviews = await getPRsWithoutReviews(prs, threshold)
  if (prsWithoutReviews.length) {
    prsWithoutReviews.forEach(pr => {
      response += `**PR #${pr.number}:** ${pr.title} <${pr['html_url']}>\n`
    })
    let responses = splitStringByNewLine(response)
    return responses;
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

function splitStringByNewLine(str) {
  const maxLength = 1500;
  const lines = str.split('\n');
  let result = [];
  let currentString = '';
  lines.forEach((line) => {
    if (currentString.length + line.length + 1 <= maxLength) {
      // Add the line to the current string
      currentString += line + '\n';
    } else {
      // Add the current string to the result array and start a new string
      result.push(currentString);
      currentString = line + '\n';
    }
  });
  // Add the final string to the result array
  result.push(currentString);
  return result;
}