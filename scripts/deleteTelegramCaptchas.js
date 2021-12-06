const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');

module.exports = function(robot) {
  robot.hear(/^[0-9]{4}$/, async (res) => {
    const channel = robot.client.channels.cache.find(x => x.id == res.message.room)
    const message = await channel.messages.fetch(res.message.id)
    message.delete()
  })
}