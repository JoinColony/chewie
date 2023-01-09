module.exports = function(robot) {
  const BRAIN_PREFIX = 'channel-subscriptions';
  const { brain } = robot
const getBrain = require('./utils/brain');

const {
  getMap,
  setMap,
} = getBrain(BRAIN_PREFIX);

  robot.hear(/!channel subscribe/, async res => {
    // Subscribe the user who sent this message to this channel
    const { message } = res;
    const userid = message.user.id
    const channelId = message.room;
    const l = getMap('subscriptions', brain);
    if (!l[channelId]){
      l[channelId] = {  }
    }
    l[channelId][userid] = true;
    setMap('subscriptions', l, brain);
    res.send("I subscribed you to this channel")
  })

  robot.hear(/!channel unsubscribe/, async res => {
    // Unsubscribe the user who sent this message to this channel
    // Subscribe the user who sent this message to this channel
    const { message } = res;
    const userid = message.user.id
    const channelId = message.room;
    const l = getMap('subscriptions', brain);
    if (!l[channelId]){
      return;
    }
    l[channelId][userid] = false;
    setMap('subscriptions', l, brain);
    res.send("I unsubscribed you from this channel")
  })

  robot.hear(/.*/, async res => {
    const { message } = res;
    const channelId = message.room;
    let channel = await robot.client.channels.fetch(channelId)
    let member;
    try {
      member = await channel.guild.members.fetch(message.user.id)
    } catch (err){
      console.log(err)
      console.log(JSON.stringify(message));
      return;
    }
    // Is message in a channel that someone has subscribed to?
    const l = getMap('subscriptions', brain);
    if (l[channelId]){
      for (const userid of Object.keys(l[channelId])){
        const subscribed = l[channelId][userid]
        if (subscribed && message.user.id != userid){
          const u = await robot.client.users.fetch(userid);
          u.send(`_In ${channel.name}:_ **<${member.nickname}>** ${message.text}`);
        }
      }
    }
  })
}