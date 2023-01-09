const isPrivateSlackMessage = res => res.message.room.startsWith('D');
const isPrivateDiscordMessage = (client, res) => {
	// Get user
	const user = client.users.cache.get(res.message.user.id);
	// Get their DM channel with the bot
	const channel = user.dmChannel
	// Is that where we saw the message?
  // If channel is not set, then it definitely wasn't in DM, as we don't have a DM channel open with that user!
	return !!channel && channel.id === res.message.room;
}

const isChannel = (res, channelId) => res.message.room === channelId;

module.exports = { isPrivateSlackMessage, isChannel, isPrivateDiscordMessage };
