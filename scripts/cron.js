const CronJob = require('cron').CronJob
const exec = require('await-exec')

module.exports = robot => {
  const gcloudCleanupJob = new CronJob({
  cronTime: '00 34 15 * * *',
    onTick: async () => {
      let res;
      console.log('Cleaning up GCloud images');
      try {
        res = await exec(`AUTO=true ./colony-deployment-scripts/cleanupGcloud.sh`)
      	console.log(res);
      } catch (err) {
      	console.log('ERROR:', err);
      }
    },
    start: false,
    timeZone: 'Europe/London'
  })
  gcloudCleanupJob.start()
}