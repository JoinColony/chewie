const { prHelpers } = require('./utils/prs.js')
const CronJob = require('cron').CronJob
require('dotenv').config()

const processPRs = async robot => {
  const roomId = process.env.HUBOT_DISCORD_DEV_CHANNEL
  const message = await getMessage(robot);
  robot.messageRoom(roomId, message.trim());
}

function getBusinessDatesCount(startDate, endDate) {
  let count = 0;
  const curDate = new Date(startDate.getTime());
  while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay();
      if(dayOfWeek !== 0 && dayOfWeek !== 6) count++;
      curDate.setDate(curDate.getDate() + 1);
  }
  return count;
}

const getMessage = async robot => {
  const threshold = 5 // number of days since interaction
  const github = require('githubot')(robot)
  const repo = github.qualified_repo("colonyNetwork")
  const BASE_URL = `https://api.github.com/repos/${repo}`


  const { getPRs, getReviews, getComments } = prHelpers(robot)
  const prs = await getPRs(BASE_URL)

  const soon = [];
  const over = [];

  for (const pr of prs) {
    if (pr.draft) {
      continue;
    }
    if (pr.labels.filter(label => label.name === 'on-hold').length > 0) {
      continue;
    }
    const reviews = await getReviews(pr);

    const comments = await getComments(pr);
    const last_review_timestamp = reviews.length > 0 ? reviews[reviews.length - 1].submitted_at : pr.created_at;
    const last_comment_timestamp = comments.length > 0 ? comments[comments.length - 1].created_at : pr.created_at;

    const last_event_timestamp = Math.max(new Date(last_review_timestamp), new Date(last_comment_timestamp));

    const days = getBusinessDatesCount(new Date(last_event_timestamp), new Date());
    if (days >= threshold -2 && days < threshold) {
      soon.push(pr);
    } else if (days >= threshold) {
      over.push(pr);
    }
  }
  let response = "";
  if (soon.length > 0) {
    response += `**The following PRs will be over the threshold of ${threshold} days soon:**\n`
    soon.forEach(pr => {
      response += `**PR #${pr.number}:** ${pr.title} <${pr['html_url']}>\n`
    })
  }
  if (over.length > 0) {
    response += `**The following PRs are over the threshold of ${threshold} days:**\n`
    over.forEach(pr => {
      response += `**PR #${pr.number}:** ${pr.title} <${pr['html_url']}>\n`
    })
  }
  return response;
}

const setupCronJob = robot => {
  const job = new CronJob({
    // Every weekday 08:30h London
    cronTime: '00 30 08 * * 1-5',
    onTick: () => {
      processPRs(robot)
    },
    start: false,
    timeZone: 'Europe/London'
  })
  job.start()
}
module.exports = function(robot) {
  setupCronJob(robot)
}
