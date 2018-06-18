// Description:
//   Post Figma previews when linked
//
// Commands:
//   https://www.figma.com/file/... - display a Figma preview
//
// Dependencies:
//   'figma-js': '1.3.x'
//   'api-slack'
//
// Author:
//   sprusr

module.exports = (robot) => {
  const Figma = require('figma-js')
  const { WebClient } = require('@slack/client')
  const figma = Figma.Client({
    personalAccessToken: process.env.HUBOT_FIGMA_TOKEN
  })
  const slack = robot.adapterName === 'slack' ? new WebClient(robot.adapter.options.token) : undefined
  const fileRegex = /https:\/\/www.figma.com\/file\/([A-z0-9]*)\/?/g

  const simpleFigma = async (msg, files) => {
    let response = ''
    for (let file of files) {
      response += `${file.name} ${file.thumbnailUrl}\n`
    }
    msg.send(response.trim())
  }

  const slackFigma = async (msg, files) => {
    for (let file of files) {
      await slack.chat.postMessage({
        channel: msg.message.rawMessage.channel,
        attachments: [{
          fallback: `${file.name} on Figma ${file.thumbnailUrl}`,
          color: '#36a64f',
          title: file.name,
          title_link: file.url,
          image_url: file.thumbnailUrl,
          footer: 'Figma',
          footer_icon: 'https://static.figma.com/app/icon/1/favicon.png',
          ts: Math.round(Date.parse(file.lastModified) / 1000) // unixtime
        }]
      })
    }
  }

  robot.hear(fileRegex, async msg => {
    let matches, files = []
    while (matches = fileRegex.exec(msg.message.text)) {
      const fileId = matches[1]
      try {
        const file = await figma.file(fileId)
        file.url = matches[0]
        files.push(file.data)
      } catch (error) {
        console.error('Error getting Figma file: ', error)
      }
    }
    // TODO: check for duplicate files
    return slack ? slackFigma(msg, files) : simpleFigma(msg, files)
  })
}
