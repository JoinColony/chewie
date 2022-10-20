const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');
module.exports = function(robot) {

  robot.hear(/Chewie, what do you hear\?/, async (res) => {
    if (res.message.user.id !='994244548010197132') return
    res.robot.adapter.send(res.envelope, 'Nothing but the rain.');
  })

}