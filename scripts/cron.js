var cron = require('node-cron');

cron.schedule('* * 11 * *', () => {
  let res;
  console.log('Cleaning up GCloud images');
  try {
	res = await exec(`AUTO=true ./colony-deployment-scripts/cleanupGcloud.sh`)
	console.log(res);
  } catch (err) {
  	console.log('ERROR:', err);
  }
});