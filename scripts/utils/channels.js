const isPrivateSlackMessage = res => res.message.room.startsWith('D');
const isChannel = (res, channelId) => res.message.room === channelId;

module.exports = { isPrivateSlackMessage, isChannel };
