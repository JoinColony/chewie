// Description:
//   Used to deploy specified builds to QA
const exec = require('await-exec')

module.exports = async function(robot) {
  const deployRegex = /!qa deploy ([0-9a-fA-f]*)/

  // Activate credentials
  await exec(`echo ${process.env.GCLOUD_SERVICE_KEY} | base64 --decode > /gcloud-service-key.json`);
  await exec('gcloud auth activate-service-account --key-file /gcloud-service-key.json');
  await exec(`gcloud config set project ${process.env.GCLOUD_PROJECT_NAME}`);
  await exec(`gcloud --quiet config set container/cluster ${process.env.GCLOUD_CLUSTER_NAME}`)
  await exec(`gcloud config set compute/zone ${process.env.GCLOUD_CLOUDSDK_COMPUTE_ZONE}`);
  await exec(`gcloud --quiet container clusters get-credentials ${process.env.GCLOUD_CLUSTER_NAME}`);

  robot.hear(deployRegex, async msg => {
    const matches = deployRegex.exec(msg.message.text);

    await exec('kubectl patch deployment dapp-red -p \'{"spec":{"template":{"spec":{"containers":[{"name":"dapp","image":"eu.gcr.io/fluent-aileron-128715/dapp-goerli:' + matches[1] + '"}]}}}}\'')
    msg.send('Container patched. Could take up to two minutes to start responding.')
  })
}
