const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');

module.exports = function(robot) {
  robot.hear(/<@!720953382789185548>, what do you hear\?/, async (res) => {
  	if (res.message.user.id !='273398423787536384') return
  	res.robot.adapter.send(res.envelope, 'Nothing but the rain.');
  })
}