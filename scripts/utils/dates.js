const chrono = require('chrono-node');
const moment = require('moment-timezone');
const getBrain = require('./brain');
const getTimezoneFromMap = getBrain('timezones').getFromMap;

const getOffsetDate = (offset, timestamp = Date.now()) => {
  const d = new Date(timestamp + offset * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
};

const getOffsetDay = offset => {
  const d = new Date(Date.now() + offset * 60 * 60 * 1000);
  return d.getUTCDay();
};

const getOffsetHour = offset => {
  const d = new Date(Date.now() + offset * 60 * 60 * 1000);
  return d.getUTCHours();
};

// Returns the current date for a specific user
const getCurrentDateForUser = (robot, user) => {
  // const offset = user.slack.tz_offset / (60 * 60);
  // return getOffsetDate(offset);
  zone = getTimezoneFromMap('users', user, robot.brain);
  const d = moment(Date.now())
  return d.tz(zone).format('YYYY-M-D')

};

const getCurrentDayForUser = (robot, user) => {
  // const offset = user.slack.tz_offset / (60 * 60);
  zone = getTimezoneFromMap('users', user, robot.brain);
  const d = moment(Date.now())
  return d.tz(zone).format('d')
};

const getCurrentTimeForUser = (robot, user) => {
  zone = getTimezoneFromMap('users', user, robot.brain);
  // const offset = user.slack.tz_offset / (60 * 60);
  const d = moment(Date.now())
  return d.tz(zone).format('H');
  // return getOffsetHour(offset);
};

const dateIsInRange = (dateStr, rangeStr) => {
  const range = rangeStr.split('>');
  const date = new Date(dateStr);
  const start = new Date(range[0]);
  const end = new Date(range[1]);
  return start <= date && date <= end;
};

const dateIsOlderThan = (dateOrRangeStr, refDate) => {
  const date = dateOrRangeStr.includes('>')
    ? dateOrRangeStr.split('>')[1]
    : dateOrRangeStr;
  return new Date(date) <= new Date(refDate);
};

const parseNaturalDate = (expr, user, robot) => {
  const referenceDate = new Date(`${getCurrentDateForUser(robot, user)} 11:00Z`);
  const parsed = chrono.parse(expr, referenceDate, { forwardDate: true });
  const { start } = parsed[0];
  const end = parsed.length === 2
    ? parsed[1].start
    : parsed[0].end;
  const dateStart = `${start.get('year')}-${start.get('month')}-${start.get(
    'day'
  )}`;
  if (end) {
    const dateEnd = `${end.get('year')}-${end.get('month')}-${end.get('day')}`;
    return `${dateStart}>${dateEnd}`;
  }
  return dateStart;
};

function getBusinessDatesCount(startDate, endDate) {
  let count = 0;
  if (startDate > endDate) {
    return count;
  }
  const curDate = new Date(startDate.getTime());
  while (curDate.toDateString() !== endDate.toDateString()) {
      const dayOfWeek = curDate.getDay();
      if(dayOfWeek !== 0 && dayOfWeek !== 6) count++;
      curDate.setDate(curDate.getDate() + 1);
  }
  return count;
}

module.exports = {
  getOffsetDate,
  getOffsetDay,
  getOffsetHour,
  getCurrentDateForUser,
  getCurrentDayForUser,
  getCurrentTimeForUser,
  dateIsInRange,
  dateIsOlderThan,
  parseNaturalDate,
  getBusinessDatesCount,
};
