// Description:
//   Used to deploy specified builds to QA
const exec = require('await-exec')
const request = require('request-promise-native');
const { isChannel, isPrivateSlackMessage } = require('./utils/channels');

const getBrain = require('./utils/brain');

const BRAIN_PREFIX = 'deployment';

const {
  addToMap,
  getFromMap,
  getMap,
  removeFromMap,
  removeMap,
  setMap,
  updateMap,
} = getBrain(BRAIN_PREFIX);

module.exports = async function(robot) {

  // Activate credentials
  await exec(`echo ${process.env.GCLOUD_SERVICE_KEY} | base64 --decode > /gcloud-service-key.json`);
  await exec('gcloud auth activate-service-account --key-file /gcloud-service-key.json');
  await exec(`gcloud config set project ${process.env.GCLOUD_PROJECT_NAME}`);
  await exec(`gcloud --quiet config set container/cluster ${process.env.GCLOUD_CLUSTER_NAME}`)
  await exec(`gcloud config set compute/zone ${process.env.GCLOUD_CLOUDSDK_COMPUTE_ZONE}`);
  // It appears this is not needed to patch the containers as we want, so
  // let's not bother given that it errors
  // await exec(`gcloud --quiet container clusters get-credentials ${process.env.GCLOUD_CLUSTER_NAME}`);

  // Get the devops channel ID. The topic will be used to determine what colour is staging / production when asked to deploy to either.
  let channels = await robot.adapter.client.web.conversations.list();
  let devopsChannel = channels.channels.filter(channel => channel.name === "devops")[0];
  const devopsid = devopsChannel.id


  async function transformUserToID(user) {
    let users = await robot.adapter.client.web.users.list();
    users = users.members;
    users = users.filter(u => (u.profile.display_name===user || u.name === user || u.id===user));
    if (users.length === 0){
      return [false, "Couldn't find such a user"];
    } else if (users.length > 1){
      return [false, "More than one user matched - be more specific"];
    } else {
      return [true, users[0].id];
    }
  }

  const canDeploy = (userid, where, brain) => {
    const users = getMap(`${where}Deployers`, brain);
    return !!users[userid];
  }
  const isAdmin = (user, brain) => {
    const admins = getMap('admins', brain)
    return !!admins[user.id]
  }

  // Returns true if no admins exist yet
  const noAdmins = brain => {
    const admins = getMap('admins', brain)
    if (!Object.keys(admins).length) {
      return true
    }
    return false
  }

  const getUserNameFromID = (userToFind, brain) => {
    const user = brain.userForId(userToFind)
    return user ? user.name : userToFind
  }

  const addUserWithRole = (userid, role, brain) => {
    return addToMap(`${role}s`, userid, true, brain)
  }

  const removeUserWithRole = (userid, role, brain) => {
    return removeFromMap(`${role}s`, userid, brain)
  }

  const getUserList = (map, brain) => {
  const userids = getMap(map, brain)
  return Object.keys(userids)
    .map(userid => `• <@${userid}>`)
    .join('\n')
  }

  robot.hear(/!deployment permissions/, async(res) => {
    const { brain } = robot
    const { user } = res.message

    if (!isPrivateSlackMessage(res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return


    const msg = `QA deployers:\n${getUserList(
      'qaDeployers',
      brain
    )}\nStaging deployers:\n${getUserList(
      'stagingDeployers',
      brain
    )}\nProduction deployers:\n${getUserList(
      'productionDeployers',
      brain
    )}\nAdmins:\n${getUserList('admins', brain)}`
    res.send(msg);

  });

  robot.hear(/!deployment admin add (.+)/, async (res) => {
    const { user } = res.message
    const { brain } = robot
    const who = res.match[1].toLowerCase();

    if (!isPrivateSlackMessage(res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return
    const [userLookupSuccess, userIDToAdd] = await transformUserToID(who)
    if (!userLookupSuccess){
      return msg.send(userIDToAdd);
    }
    if (userIDToAdd && addUserWithRole(userIDToAdd, 'admin', brain)) {
      return res.send(
        `I added <@${userIDToAdd}> as a deployment admin.`
      )
    }
    return res.send(
      'Could not add user as a deployment admin. Maybe they do not exist or are already?'
    )
  })

  robot.hear(/!deployment add (.+) (.+)/, async (res) => {
    const { user } = res.message
    const { brain } = robot
    const where = res.match[1].toLowerCase();
    const who = res.match[2]

    if (!isPrivateSlackMessage(res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return
    const [userLookupSuccess, userIDToAdd] = await transformUserToID(who)
    if (!userLookupSuccess){
      return msg.send(userIDToAdd);
    }
    if (userIDToAdd && addUserWithRole(userIDToAdd, `${where}Deployer`, brain)) {
      return res.send(
        `I added <@${userIDToAdd}> as ${where} deployer.`
      )
    }
    return res.send(
      `Could not add <@${userIDToAdd}> as a deployer. Maybe they do not exist or are already?`
    )
  })


  robot.hear(/!deployment remove (.+) (.+)/, async (res) => {
    const { user } = res.message
    const { brain } = robot
    const where = res.match[1].toLowerCase();
    if (where !== "qa" && where !== "staging" && where !== "production") { return }
    const who = res.match[2];

    if (!isPrivateSlackMessage(res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return
    const [userLookupSuccess, userToRemove] = await transformUserToID(res.match[2])
    if (!userLookupSuccess){
      return res.send(userToRemove);
    }
    if (userToRemove && removeUserWithRole(userToRemove, `${where}Deployer`, brain)) {
      return res.send(
        `I removed <@${userToRemove}> as ${where} deployer.`
      )
    }
    return res.send(
      `Could not remove <@${userToRemove}> as ${where} deployer. Maybe they do not have the role?`
    )
  })

  robot.hear(/!build (goerli|mainnet) ([0-9a-fA-f]*)/, async msg => {
    const buildInfo = await request({
      method: 'POST',
      uri: `https://circleci.com/api/v1.1/project/github/JoinColony/colonyDapp/tree/${msg.match[2]}`,
      auth: {
        'user': process.env.CIRCLE_CI_API_KEY
      },
      formData: {
        'build_parameters[CIRCLE_JOB]': `build-${msg.match[1]}-image`
      },
      json: true,
    })
    msg.send("Once this build is complete, you will be able to issue an appropriate !deploy command:", buildInfo.build_url);
  });

  const deployRegex = /!deploy (qa|staging|production) ([0-9a-fA-f]*)/
  robot.hear(deployRegex, async msg => {
    const { brain } = robot;

    const matches = deployRegex.exec(msg.message.text);
    if (matches[1] === 'qa'){
      // Check they have permission
      if (!canDeploy(msg.message.user.id, 'qa', brain)) {
        return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
      }
      await exec('kubectl patch deployment dapp-red -p \'{"spec":{"template":{"spec":{"containers":[{"name":"dapp","image":"eu.gcr.io/fluent-aileron-128715/dapp-goerli:' + matches[2] + '"}]}}}}\'')
    } else if (matches[1] === 'staging' || matches[1] === 'production') {
      // Get colours
      const response = await robot.adapter.client.web.channels.info(devopsid);
      devopsChannel = response.channel;
      const devopsTopic = devopsChannel.topic.value;
      let colour;

      if (matches[1] === 'staging'){
        // check they have staging permission
        if (!canDeploy(msg.message.user.id, 'staging', brain)) {
          return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
        }
        const stagingColourRegex = /Currently staging: ([a-zA-Z]*)/
        const stagingColourMatches = stagingColourRegex.exec(devopsTopic);
        colour = stagingColourMatches[1].toLowerCase();
      } else {
        // check they have production permission
        if (!canDeploy(msg.message.user.id, 'production', brain)) {
          return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
        }
        const productionColourRegex = /Currently production\/live: ([a-zA-Z]*)/
        const productionColourMatches = productionColourRegex.exec(devopsTopic);
        colour = productionColourMatches[1].toLowerCase();
      }
      await exec('kubectl patch deployment dapp-' + colour +' -p \'{"spec":{"template":{"spec":{"containers":[{"name":"dapp","image":"eu.gcr.io/fluent-aileron-128715/dapp-mainnet:' + matches[2] + '"}]}}}}\'' )
    }
    msg.send('Container patched. Could take up to two minutes to start responding.')
  })
}
