// Description:
//   Links to GitHub issues when posted in the shorthand user/repo#nnn
//   Adapted from https://github.com/github/hubot-scripts/blob/master/src/scripts/github-issue-link.coffee
//
// Dependencies:
//   'githubot': '0.4.x'
//
// Configuration:
//   HUBOT_GITHUB_REPO
//   HUBOT_GITHUB_TOKEN
//
// Commands:
//   #nnn - link to GitHub issue nnn for HUBOT_GITHUB_REPO project
//   repo#nnn - link to GitHub issue nnn for repo project
//   user/repo#nnn - link to GitHub issue nnn for user/repo project
//
// Author:
//   sprusr

module.exports = function(robot) {
  const github = require('githubot')(robot)
  const ignoreUsers = 'github|hubot'
  const apiUrl = 'https://api.github.com'

  robot.hear(/((\S*|^)?#(\d+)).*/, msg => {
    const issue = msg.match[3]

    if (msg.message.user.name.match(new RegExp(ignoreUsers, 'gi'))) return
    if (isNaN(issue)) return

    const repo = msg.match[2]
      ? github.qualified_repo(msg.match[2])
      : github.qualified_repo(process.env.HUBOT_GITHUB_REPO)

    github.get(`${apiUrl}/repos/${repo}/issues/${issue}`, res => {
      const title = res.title
      const url = res.html_url
      const type = res.pull_request ? "PR" : "Issue"
      msg.send(`${type} ${issue}: ${title} ${url}`)
    })
  })
}
