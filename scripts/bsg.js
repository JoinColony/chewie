const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');

module.exports = function(robot) {
  robot.hear(/@Chewie, what do you hear\?/, async (res) => {
  	if (res.message.user.id !='273398423787536384') return
  	res.send('Nothing but the rain.');
  })
}