// Description:
//   Post Figma previews when linked
//
// Commands:
//   https://www.figma.com/file/... - display a Figma preview
//
// Dependencies:
//   'figma-js': '1.3.x'
//
// Author:
//   sprusr

const Figma = require('figma-js')

module.exports = (robot) => {
  const figma = Figma.Client({
    personalAccessToken: process.env.HUBOT_FIGMA_TOKEN
  })

  robot.hear(/https:\/\/www.figma.com\/file\/([A-z0-9]*)\/?/, async msg => {
    try {
      const fileId = msg.match[1]
      const file = await figma.file(fileId)
      const name = file.data.name
      const thumbnail = file.data.thumbnailUrl
      msg.send(`${name} ${thumbnail}`)
    } catch (error) {
      console.error(error)
    }
  })
}
