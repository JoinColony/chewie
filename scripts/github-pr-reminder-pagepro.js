const { isPrivateDiscordMessage } = require('./utils/channels.js')
const { getBusinessDatesCount } = require('./utils/dates.js')
const { prHelpers } = require('./utils/prs.js')
const CronJob = require('cron').CronJob
require('dotenv').config()

const processPRs = async robot => {
  const roomId = process.env.HUBOT_DISCORD_DEV_CHANNEL
  const message = await getMessage(robot);
  if (message === "") {
    console.log("No PRs to remind about")
    return;
  }
  robot.messageRoom(roomId, message.trim());
}

const getMessage = async robot => {


  const threshold = 3 // number of days since interaction
  const github = require('githubot')(robot)
  const repo = github.qualified_repo("colonyCDapp")
  const BASE_URL = `https://api.github.com/repos/${repo}`


  const { getPRs, getReviews, getComments, getPREvents, getPRCommits, getTeamMembers } = prHelpers(robot)
  const teamMembers = await getTeamMembers('joincolony', 'pagepro')
  const pageproLogins = teamMembers.map(m => m.login).filter(l => ["rdig","arrenv"].indexOf(l) === -1);
  const prs = await getPRs(BASE_URL)

  const over = [];

  for (const pr of prs) {
    // console.log(pr);
    if (pr.draft) {
      continue;
    }
    if (pr.labels.filter(label => label.name === 'on-hold').length > 0) {
      continue;
    }
    // This is only intended to alert about PRs that have been made by Pagepro team members
    if (!pageproLogins.includes(pr.user.login)) {
      continue;
    }
    const reviews = await getReviews(pr);
    const comments = await getComments(pr);
    const events = await getPREvents(pr);
    const commits = await getPRCommits(pr);

    const labellingEvents = events.filter(event => event.event === 'labeled' || event.event === 'unlabeled');

    const last_review_timestamp = reviews.length > 0 ? reviews[reviews.length - 1].submitted_at : pr.created_at;
    const last_comment_timestamp = comments.length > 0 ? comments[comments.length - 1].created_at : pr.created_at;
    const last_label_timestamp = labellingEvents.length > 0 ? labellingEvents[labellingEvents.length - 1].created_at : pr.created_at;
    const last_commit_author_timestamp = commits.length > 0 ? commits[commits.length - 1].commit.author.date : pr.created_at;

    const last_event_timestamp = Math.max(new Date(last_review_timestamp), new Date(last_comment_timestamp), new Date(last_label_timestamp), new Date(last_commit_author_timestamp));


    const days = getBusinessDatesCount(new Date(last_event_timestamp), new Date());
    if (days >= threshold) {
      over.push(pr);
    }
  }
  let response = "";

  if (over.length > 0) {
    response += `** <@&1293125237344571442> The following PagePro PRs haven't had any activity for the last ${threshold} days:**\n`
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
  
  robot.hear(/!pageproReminder/, async res => {
    if (!isPrivateDiscordMessage(robot.client, res)) return
    console.log("Received !pageproReminder command - please wait while I query the Github API");
    const message = await getMessage(robot);
    res.send(message);
  });
}
