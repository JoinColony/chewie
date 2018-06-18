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
  const issueRegex = /(\S*|^)?#(\d+)/g
  const ignoreUsers = 'github|hubot'
  const apiUrl = 'https://api.github.com'

  const getIssue = async (repo, issue) => {
    return new Promise((resolve, reject) => {
      github.get(`${apiUrl}/repos/${repo}/issues/${issue}`, res => {
        resolve(res)
      })
    })
  }

  robot.hear(issueRegex, async msg => {
    let matches, response = ''
    while (matches = issueRegex.exec(msg.message.text)) {
      const issueNumber = matches[2]

      if (msg.message.user.name.match(new RegExp(ignoreUsers, 'gi'))) break
      if (isNaN(issueNumber)) break

      const repo = matches[1]
        ? github.qualified_repo(matches[1])
        : github.qualified_repo(process.env.HUBOT_GITHUB_REPO)

      const issue = await getIssue(repo, issueNumber)
      const title = issue.title
      const url = issue.html_url
      const type = issue.pull_request ? "PR" : "Issue"

      response += `${type} #${issueNumber}: ${title} ${url}\n`
    }
    msg.send(response.trim())
  })
}
