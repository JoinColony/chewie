// Description:
//   Create countdown timers
//
// Dependencies:
//   'cron': '1.3.x'
//
// Configuration:
//
// Commands:
//   add 'My title' 2019-04-07
//     Add an event with a title and a due date
//
// Author:
//   JamesLefrere

const CronJob = require('cron').CronJob;

const getBrain = require('./brain');

const {
  getOffsetDate,
  getOffsetDay,
  getOffsetHour,
  getCurrentDateForUser,
  getCurrentDayForUser,
  getCurrentTimeForUser,
  dateIsInRange,
  dateIsOlderThan,
  parseNaturalDate,
} = require('./dates');

const { isPrivateSlackMessage } = require('./utils/channels');

const BRAIN_PREFIX = 'countdown';

const COUNTDOWNS = 'countdowns';

const {
  addToMap,
  getFromMap,
  getMap,
  removeFromMap,
  removeMap,
  setMap,
  updateMap,
} = getBrain(BRAIN_PREFIX);

const processCountdowns = robot => {
  const { brain } = robot;
  const currentDate = getOffsetDate(-11);

  Object
    .entries(getMap('countdowns', brain))
    .forEach(([key, { title, dueDate, room }]) => {
    const diff = Math.abs(dueDate.getTime() - currentDate.getTime());

    if (diff < 0) {
      return removeFromMap(key);
    }

    const hours = (diff / (1000 * 60 * 60)).toFixed(2);

    const sass = (() => {
      if (hours > 24 * 7 * 4) return 'An ocean of time.';
      if (hours > 24 * 7 * 3) return `It's getting closer, but it'll be fine.`;
      if (hours > 24 * 7 * 2) return 'Did you try working faster?';
      if (hours > 24 * 7) return `That's quite soon if you think about it.`;
      if (hours > 24 * 6) return `Well that doesn't sound right...`;
      if (hours > 24 * 5) return 'A week?! A mere working week?!';
      if (hours > 24 * 4) return 'Shit, we can do it!';
      if (hours > 24 * 3) return 'A'.repeat(20);
      if (hours > 24 * 2) return `I'll give you 1 ETH if you finish it today.`;
      if (hours > 24) return 'A'.repeat(200);
      return 'PANIC MODE ENGAGE!!! gogogogogogogogogogogogogo54321111111glhf';
    })();

    robot.messageRoom(
      room,
      `${title}: ${hours} hours remaining. ${sass}`
    );
  });
};

const setupCronJob = robot => {
  const job = new CronJob({
    // Every weekday 23:45h
    cronTime: '00 45 23 * * *',
    onTick: () => {
      processCountdowns(robot);
    },
    start: false,
    // Last time zone of the day (UTC-11)
    timeZone: 'Pacific/Niue'
  });
  job.start();
};

module.exports = robot => {
  const { brain } = robot;
  setupCronJob(robot);

  robot.hear(/^countdown add '$(.+)' $(.+)$/, res => {
    const { user, room } = res.message;

    if (isPrivateSlackMessage(res)) {
      return;
    }

    const title = res.match[1];
    const dueDate = parseNaturalDate(res.match[2], user);

    const key = title.replace(/\s/g, '');
    const existing = getFromMap(COUNTDOWNS, key, brain);

    if (existing) {
      return res.send('Oops, a countdown with that title already exists');
    }

    addToMap(COUNTDOWNS, key, { title, dueDate, room }, brain);
  });
};
