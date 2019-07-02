export const isPrivateSlackMessage = res => res.message.room.startsWith('D');
export const isChannel = (res, channelId) => res.message.room === channelId;
