// Description:
//   Used to deploy specified builds to QA
const exec = require('await-exec')

module.exports = async function(robot) {
  const deployRegex = /!(qa|staging|production) deploy ([0-9a-fA-f]*)/

  // Activate credentials
  await exec(`echo ${process.env.GCLOUD_SERVICE_KEY} | base64 --decode > /gcloud-service-key.json`);
  await exec('gcloud auth activate-service-account --key-file /gcloud-service-key.json');
  await exec(`gcloud config set project ${process.env.GCLOUD_PROJECT_NAME}`);
  await exec(`gcloud --quiet config set container/cluster ${process.env.GCLOUD_CLUSTER_NAME}`)
  await exec(`gcloud config set compute/zone ${process.env.GCLOUD_CLOUDSDK_COMPUTE_ZONE}`);
  await exec(`gcloud --quiet container clusters get-credentials ${process.env.GCLOUD_CLUSTER_NAME}`);

  // Get the devops topic ID. The topic will be used to determine what colour is staging / production when asked to deploy to either.
  let channels = await robot.adapter.client.web.conversations.list();
  let devopsChannel = channels.channels.filter(channel => channel.name === "devops")[0];
  const devopsid = devopsChannel.id

  robot.hear(deployRegex, async msg => {
    const matches = deployRegex.exec(msg.message.text);
    if (matches[1] === 'qa'){
      await exec('kubectl patch deployment dapp-red -p \'{"spec":{"template":{"spec":{"containers":[{"name":"dapp","image":"eu.gcr.io/fluent-aileron-128715/dapp-goerli:' + matches[2] + '"}]}}}}\'')
    } else if (matches[1] === 'staging' || matches[1] === 'production') {
      // Get colours
      const response = await robot.adapter.client.web.channels.info(devopsid);
      devopsChannel = response.channel;
      const devopsTopic = devopsChannel.topic.value;
      let colour;

      if (matches[1] === 'staging'){
        const stagingColourRegex = /Currently staging: ([a-zA-Z]*)/
        const stagingColourMatches = stagingColourRegex.exec(devopsTopic);
        colour = stagingColourMatches[1].toLowerCase();
      } else {
        const productionColourRegex = /Currently production\/live: ([a-zA-Z]*)/
        const productionColourMatches = productionColourRegex.exec(devopsTopic);
        colour = productionColourMatches[1].toLowerCase();
      }
      await exec('kubectl patch deployment dapp-' + colour +' -p \'{"spec":{"template":{"spec":{"containers":[{"name":"dapp","image":"eu.gcr.io/fluent-aileron-128715/dapp-main:' + matches[2] + '"}]}}}}\'' )
    }
    msg.send('Container patched. Could take up to two minutes to start responding.')
  })
}
