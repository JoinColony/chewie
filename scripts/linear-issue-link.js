// Description:
//   Links to Linear issues when posted in the shorthand DEV-NNN
//   HUBOT_LINEAR_TOKEN
//
const fetch = require('node-fetch');

async function getIssue(issueId) {
  let query = {"query": "{ issue(id: \"" + issueId + "\") { title url } }" }

  res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': process.env.HUBOT_LINEAR_TOKEN
    },
    body: JSON.stringify(query)
  })

  let r = await res.json()
  return r.data.issue;
}


module.exports = function(robot) {
  const issueRegex = /(DEV-[0-9]*)/g
  const ignoreUsers = 'github|hubot'

  robot.hear(issueRegex, async msg => {
    let matches, included = [], response = ''
    while (matches = issueRegex.exec(msg.message.text)) {
      if (included.indexOf(matches[0]) === -1)
        included.push(matches[0])
      else
        continue

      if (msg.message.user.name.match(new RegExp(ignoreUsers, 'gi'))) break

      const issue = await getIssue(matches[0])
      const title = issue.title
      const url = issue.url

      response += `**#${matches[0]}:** ${title} <${url}>\n`
    }
    msg.send(response.trim())
  })
}
