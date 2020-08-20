const isPrivateSlackMessage = res => res.message.room.startsWith('D');
const isPrivateDiscordMessage = (client, res) => {
  console.log(res);
	// Get user
	const user = client.users.get(res.message.user.id);
	// Get their DM channel with the bot
	const channel = user.dmChannel
	// Is that where we saw the message?
	return channel.id === res.message.room;
}

const isChannel = (res, channelId) => res.message.room === channelId;

module.exports = { isPrivateSlackMessage, isChannel, isPrivateDiscordMessage };
