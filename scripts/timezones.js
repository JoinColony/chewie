const getBrain = require('./utils/brain');
const informal = require('spacetime-informal')

const BRAIN_PREFIX = 'timezones';
const { isPrivateDiscordMessage } = require('./utils/channels');

const {
  addToMap,
  getFromMap,
  getMap,
  removeFromMap,
  removeMap,
  setMap,
  updateMap,
} = getBrain(BRAIN_PREFIX);

const {
  getCurrentTimeForUser, getCurrentDateForUser
} = require('./utils/dates');

module.exports = robot => {
  const { brain, messageRoom } = robot

  robot.hear(/^!timezone set (.+)$/, res => {
    if (!isPrivateDiscordMessage(robot.client, res) ) return
    // Do they already have it set?
    const zone = getFromMap('users', res.message.user.id, brain);
	const newZone = informal.find(res.match[1]);
	if (zone){
		updateMap('users', res.message.user.id, newZone, brain);
	} else {
		addToMap('users', res.message.user.id, newZone, brain);
	}
	res.send(`You have set your timezone to \`${newZone}\`. If I've understood wrong, try again and try being more specific`);
  })

  robot.hear(/!timezone$/, res => {
  	console.log(res);
      if (!isPrivateDiscordMessage(robot.client, res) ) return
      console.log('whee')
  	  const zone = getFromMap('users', res.message.user.id, brain);
  	  if (zone){
  	  	res.send(`Your time zone is \`${zone}\``);
  	  } else {
  	  	res.send(`You have not yet set a time zone. Do so with the command \`!timezone set <zone>\``);
  	  }
  })
}