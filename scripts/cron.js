const CronJob = require('cron').CronJob
const exec = require('await-exec')

module.exports = robot => {
  // Leaving as an example for the future

  // const gcloudCleanupJob = new CronJob({
  // cronTime: '00 09 0 * * *',
  //   onTick: async () => {
  //     let res;
  //     console.log('Cleaning up GCloud images');
  //     try {
  //       res = await exec(`AUTO=true ./colony-deployment-scripts/cleanupGcloud.sh`)
  //     	console.log(res);
  //     } catch (err) {
  //     	console.log('ERROR:', err);
  //     }
  //   },
  //   start: false,
  //   timeZone: 'Europe/London'
  // })
  // gcloudCleanupJob.start()
}