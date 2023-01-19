// Description:
//   Used to deploy specified builds to QA
const exec = require('await-exec')
const request = require('request-promise-native');
const { isChannel, isPrivateDiscordMessage } = require('./utils/channels');

const getBrain = require('./utils/brain');

const BRAIN_PREFIX = 'deployment-discord';
const allSettled = require('promise.allsettled');
allSettled.shim()

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
  // await exec(`echo ${process.env.GCLOUD_SERVICE_KEY} | base64 --decode > /gcloud-service-key.json`);
  // await exec('gcloud auth activate-service-account --key-file /gcloud-service-key.json');
  // await exec(`gcloud config set project ${process.env.GCLOUD_PROJECT_NAME}`);
  // await exec(`gcloud --quiet config set container/cluster ${process.env.GCLOUD_CLUSTER_NAME}`)
  // await exec(`gcloud config set compute/zone ${process.env.GCLOUD_CLOUDSDK_COMPUTE_ZONE}`);
  // It appears this is not needed to patch the containers as we want, so
  // let's not bother given that it errors
  // await exec(`gcloud --quiet container clusters get-credentials ${process.env.GCLOUD_CLUSTER_NAME}`);

  await getDeploymentScripts()

  // Get the devops channel ID. The topic will be used to determine what colour is staging / production when asked to deploy to either.
  const devopsChannel = robot.client.channels.cache.find(channel => channel.name === "chewie-skunkworks");

  async function getDeploymentScripts() {
    await exec(`rm -rf ./colony-deployment-scripts`);
    await exec(`git clone https://${process.env.HUBOT_GITHUB_TOKEN}@github.com/JoinColony/colony-deployment-scripts.git`)
  }

  // async function transformUserToID(user) {
  //   let users = await robot.adapter.client.web.users.list();
  //   users = users.members;
  //   users = users.filter(u => (u.profile.display_name===user || u.name === user || u.id===user));
  //   if (users.length === 0){
  //     return [false, "Couldn't find such a user"];
  //   } else if (users.length > 1){
  //     return [false, "More than one user matched - be more specific"];
  //   } else {
  //     return [true, users[0].id];
  //   }
  // }

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
    .map(userid => `• <@!${userid}>`)
    .join('\n')
  }

  robot.hear(/!deployment permissions/, async(res) => {
    const { brain } = robot
    const { user } = res.message
    if (!isPrivateDiscordMessage(robot.client, res)) return
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

  robot.hear(/!deployment admin add <@(.+)>/, async (res) => {
    const { user } = res.message
    const { brain } = robot
    // Can't @ users not in a chat with you, so this needs to be in public now
    // if (!isPrivateDiscordMessage(robot.client, res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return
    const channel = robot.client.channels.cache.find(x => x.id == res.message.room)
    const message = await channel.messages.fetch(res.message.id)
    const who = message.mentions.users.first().id;

    if (addUserWithRole(who, 'admin', brain)) {
      return res.send(
        `I added <@${who}> as a deployment admin.`
      )
    }
    return res.send(
      'Could not add user as a deployment admin. Maybe they do not exist or are already?'
    )
  })

  robot.hear(/!deployment admin remove <@(.+)>/, async (res) => {
    const { user } = res.message
    const { brain } = robot

    // Can't @ users not in a chat with you, so this needs to be in public now
    // if (!isPrivateDiscordMessage(robot.client, res)) return
    if (!noAdmins(brain) && !isAdmin(user, brain)) return

    const channel = robot.client.channels.cache.find(x => x.id == res.message.room)
    const message = await channel.messages.fetch(res.message.id)
    const who = message.mentions.users.first().id;

    if (removeUserWithRole(who, `admin`, brain)) {
      return res.send(
        `I removed <@${who}> as a deployment admin.`
      )
    }
    return res.send(
      `Could not remove <@${who}> as deployment admin. Maybe they do not have the role?`
    )
  })

  robot.hear(/!deployment update scripts/, async (res) => {
    res.send(`Updating deployment scripts`);
    try {
      await getDeploymentScripts();
    } catch (err) {
      return res.send(`An error occurred: `, err);
    }
    res.send(`Deployment scripts updated successfully`);
  })

  robot.hear(/!deployment add ([a-z]+) (.+)/, async (res) => {
    const { user } = res.message
    const { brain } = robot
    const where = res.match[1].toLowerCase();
    if (where !== "qa" && where !== "staging" && where !== "production") { return }

    const channel = robot.client.channels.cache.find(x => x.id == res.message.room)
    const message = await channel.messages.fetch(res.message.id)
    const who = message.mentions.users.first().id;
    if (!noAdmins(brain) && !isAdmin(user, brain)) return

    if (addUserWithRole(who, `${where}Deployer`, brain)) {
      return res.send(
        `I added <@${who}> as ${where} deployer.`
      )
    }
    return res.send(
      `Could not add <@${who}> as a deployer. Maybe they do not exist or are already?`
    )
  })


  robot.hear(/!deployment remove ([a-z]+) (.+)/, async (res) => {
    const { user } = res.message
    const { brain } = robot
    const where = res.match[1].toLowerCase();
    if (where !== "qa" && where !== "staging" && where !== "production") { return }
    const channel = robot.client.channels.cache.find(x => x.id == res.message.room)
    const message = await channel.messages.fetch(res.message.id)
    const who = message.mentions.users.first().id;

    if (!noAdmins(brain) && !isAdmin(user, brain)) return

    if (removeUserWithRole(who, `${where}Deployer`, brain)) {
      return res.send(
        `I removed <@${who}> as ${where} deployer.`
      )
    }
    return res.send(
      `Could not remove <@${who}> as ${where} deployer. Maybe they do not have the role?`
    )
  })

  robot.hear(/!build (backend|frontend) ([0-9a-fA-f]*)( dev)?/, async msg => {
    if (!isDeployer(msg.message.user.id)) return;
    const formData = {
      'event_type': `Build ${msg.match[1]} request from Chewie`,
      'client_payload':{
        JOB: `build-${msg.match[1]}-image`,
        COMMIT_HASH: msg.match[2]
      }
    }
    if (msg.match[3]){
      formData['client_payload']["DEV"] = "true";
    }

    const repo = msg.match[1] === "frontend" ? "colonyDapp" : "colonyServer"

    await request({
      method: 'POST',
      uri: `https://api.github.com/repos/joinColony/${repo}/dispatches`,
      keepAlive: false,
      body: JSON.stringify(formData),
      headers:{
        "Accept": "application/vnd.github.everest-preview+json",
        "Authorization": `token ${process.env.HUBOT_GITHUB_TOKEN}`,
        "User-Agent": "JoinColony/chewie",
      }
    });

    msg.send(`Keep an eye on the build here: https://github.com/JoinColony/${repo}/actions. A notification on the outcome will also be sent to the chewie-skunkworks channel`)
  });

  async function output(msg, res){
    if (res.stdout) {
        msg.send(`Stdout:
          \`\`\`
          ${res.stdout}
          \`\`\``);
    }
    if (res.stderr){
      msg.send(`Stderr:
        \`\`\`
        ${res.stderr}
        \`\`\``);
    }
    if (!res.stderr && !res.stdout){
      msg.send(`Presumed error:
        \`\`\`
        ${res}
        \`\`\``);
    }
  }

  const resetXdaiRegex = /^!deploy reset xdai fork?$/
  robot.hear(resetXdaiRegex, async msg => {
    const { brain } = robot;
    let res;

    const matches = resetXdaiRegex.exec(msg.message.text);
    const networkId = matches[1];
    const location = matches[2];
    const commit = matches[3];
    const dev = matches[4] ? true : false;

    // Check they have permission
    if (!canDeploy(msg.message.user.id, 'qa', brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }
    msg.send("Resetting XDai fork")
    // Get colours
    const {stagingColour, productionColour} = await getColours();

    try {
      res = await exec(`AUTO=true PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/resetXdaiFork.sh`)
    } catch (err) {
      res = err;
    }
    await output(msg, res);
  });

  const triggerGraphDeployment = async function(event_type, commit){
    const formData = {
      'event_type': event_type,
      'client_payload':{
        FRONTEND_COMMIT: commit
      }
    }
    return request({
      method: 'POST',
      uri: `https://api.github.com/repos/joinColony/subgraph/dispatches`,
      keepAlive: false,
      body: JSON.stringify(formData),
      headers:{
        "Accept": "application/vnd.github.everest-preview+json",
        "Authorization": `token ${process.env.HUBOT_GITHUB_TOKEN}`,
        "User-Agent": "JoinColony/chewie",
      }
    });
  }

  const toQARegex = /^!deploy qa network ([0-9]*) (backend|frontend) ([0-9a-fA-f]*)( dev)?$/
  robot.hear(toQARegex, async msg => {
    const { brain } = robot;
    let res;

    const matches = toQARegex.exec(msg.message.text);

    const networkId = matches[1];
    const location = matches[2];
    const commit = matches[3];
    const dev = matches[4] ? true : false;

    // Check they have permission
    if (!canDeploy(msg.message.user.id, 'qa', brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }
    msg.send("Deploying to QA")
    try {
      if (location === 'frontend') {
        let imageName = `eu.gcr.io/fluent-aileron-128715/app-frontend:${commit}`
        if (dev) {
          imageName += "-dev"
        }
        res = await exec(`AUTO=true NETWORK_ID=${networkId} FRONTEND_IMAGE_NAME=${imageName} ./colony-deployment-scripts/toQA.sh`)
      } else if (matches[2] === 'backend' ) {
        res = await exec(`AUTO=true NETWORK_ID=${networkId} APP_IMAGE_NAME=eu.gcr.io/fluent-aileron-128715/app-backend:${commit} ./colony-deployment-scripts/toQA.sh`)
      }
    } catch (err) {
      res = err;
    }
    await output(msg, res);

    // Do the graph
    try {
      if (location === 'frontend') {
        if (networkId === "5"){
          await triggerGraphDeployment('trigger-deploy-goerli', commit);
          msg.send("Keep an eye on the deployment of the graph here: <https://github.com/joinColony/subgraph/actions> and the status of the graph itself (which will require time to sync after deployment) here: <https://thegraph.com/explorer/subgraph/joincolony/colony-goerli>")
        } else if (networkId === "100") {
          await triggerGraphDeployment('trigger-deploy-xdai-qa', commit)
          msg.send("Keep an eye on the deployment of the graph here: <https://github.com/joinColony/subgraph/actions> and the status of the graph itself (which will require time to sync after deployment) here: <https://thegraph.com/explorer/subgraph/joincolony/colony-xdai-qa>")
        } else {
          msg.send("I don't know how to deploy the graph for that network. Someone needs to teach this old wookie some new tricks!")
        }
      }
    } catch (err) {
      msg.send("Error trying to deploy the graph:" + console.log(err))
    }
  });

  const websiteDeploymentRegex = /^!deploy website (staging|production)$/
  robot.hear(websiteDeploymentRegex, async msg => {
    const { brain } = robot;
    let res;

    const matches = websiteDeploymentRegex.exec(msg.message.text);
    const location = matches[1];

    // Check they have permission
    if (!canDeploy(msg.message.user.id, location, brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }
    msg.send(`Deploying to ${location}`);
    const {stagingColour, productionColour} = await getColours();
    try {
      if (location === 'staging') {
        res = await exec(`AUTO=true COLOUR=${stagingColour} ./colony-deployment-scripts/deployWebsite.sh`)
      } else if (location === 'production' ) {
        res = await exec(`AUTO=true COLOUR=${productionColour} ./colony-deployment-scripts/deployWebsite.sh`)
      }
    } catch (err) {
      res = err;
    }
    await output(msg, res);
  });

  function isDeployer(id){
    const { brain } = robot;
    return canDeploy(id, 'qa', brain) || canDeploy(id, 'staging', brain) || canDeploy(id, 'production', brain)
  }

  async function getColours(){
    try {
      let res = await exec("kubectl get svc nginx-dev -o yaml | grep colour: | awk '{print $2}' | tr -d '\n'")
      const stagingColour = res.stdout;
      res = await exec("kubectl get svc nginx-prod-2 -o yaml | grep colour: | awk '{print $2}' | tr -d '\n'")
      const productionColour = res.stdout;
      return {stagingColour, productionColour}
    } catch (err){
      console.log(`GetColours Error: ${err}`);
      throw new Error('Unable to get colours for some reason')
    }
  }

  robot.hear(/^!deploy colours$/, async msg => {
    const {stagingColour, productionColour} = await getColours();
    msg.send(`Found staging as: ${stagingColour} and production as ${productionColour} by actually looking at pods`)
  })

  robot.hear(/!deploy down staging/, async msg => {
    if (!isDeployer(msg.message.user.id)) return;
    const {stagingColour} = await getColours();
    msg.send(`Will take down staging, identified as ${stagingColour}`)

    const res = await exec(`AUTO=true STAGING_COLOUR=${stagingColour} ./colony-deployment-scripts/downStaging.sh`)
    await output(msg, res);
  })

  const toStagingRegex = /^!deploy staging from ([0-9]*) to ([0-9]*)$/
  robot.hear(toStagingRegex, async msg => {
    const { brain } = robot;
    const matches = toStagingRegex.exec(msg.message.text);
    const fromNetworkId = matches[1];
    const toNetworkId = matches[2];

    // check they have staging permission
    if (!canDeploy(msg.message.user.id, 'staging', brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }

    const {stagingColour, productionColour} = await getColours();
    msg.send(`Will deploy to staging, identified as ${stagingColour}`)
    let res;
    try {
      res = await exec(`AUTO=true FROM_NETWORK_ID=${fromNetworkId} TO_NETWORK_ID=${toNetworkId} STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/toStaging.sh`)
    } catch (err){
      res = err;
    }
    await output(msg, res);
    // Get the commit being used from the image tag
    res = await exec(`kubectl get deployment dapp-red-network-$FROM_NETWORK_ID -o yaml | grep image: | awk '{print $2}' | cut -d ":" -f2 | tr -d '\n'`)
    const commit = res.stdout
    if (toNetworkId === "5"){
      await triggerGraphDeployment('trigger-deploy-goerli', commit);
      msg.send("Keep an eye on the deployment of the graph here: <https://github.com/joinColony/subgraph/actions> and the status of the graph itself (which will require time to sync after deployment) here: <https://thegraph.com/explorer/subgraph/joincolony/colony-goerli>")
    } else if (toNetworkId === "100") {
      await triggerGraphDeployment('trigger-deploy-xdai', commit)
      msg.send("Keep an eye on the deployment of the graph here: <https://github.com/joinColony/subgraph/actions> and the status of the graph itself (which will require time to sync after deployment) here: <https://thegraph.com/explorer/subgraph/joincolony/colony-xdai>")

    } else {
      msg.send("I don't know how to deploy the graph for that network. Someone needs to teach this old wookie some new tricks!")
    }
  })

//   const toProductionRegex = /^!deploy production network ([0-9]*)$/
//   robot.hear(toProductionRegex, async msg => {
//     const { brain } = robot;
//     const networkId = matches[1];
//
//     // check they have staging permission
//     if (!canDeploy(msg.message.user.id, 'production', brain)) {
//       return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
//     }
//
//     // Get colours
//     const {stagingColour, productionColour} = await getColours();
//     msg.send(`Will deploy to production. Current production is ${productionColour}. This will become staging, and staging (currently ${stagingColour}) will become production. Be sure to change the topic in #devops if successful.`)
//     let res;
//     try {
//       res = await exec(`AUTO=true NETWORK_ID=${networkId} STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/stagingToProduction.sh`)
//     } catch (err){
//       res = err;
//     }
//     await output(msg, res);
//   })

  const toProductionRegex = /^!deploy production$/
  robot.hear(toProductionRegex, async msg => {
    const { brain } = robot;

    // check they have staging permission
    if (!canDeploy(msg.message.user.id, 'production', brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }

    // Get colours
    const {stagingColour, productionColour} = await getColours();
    msg.send(`Will deploy to production. Current production is ${productionColour}. This will become staging, and staging (currently ${stagingColour}) will become production. Be sure to change the topic in #devops if successful.`)
    let res;
    let anyFailure = false;
    try {
      res = await Promise.allSettled([
        exec(`AUTO=true NETWORK_ID=100 STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/networkStagingToProduction.sh`)
      ])
      for (let i in res){
        let r = res[i];
        if (r.status === 'fulfilled'){
          await output(msg, r.value);
        } else {
          await output(msg, r.reason);
          console.log('single promise failed')
          anyFailure = true;
        }
      }
    } catch (err){
      console.log('bigger error');
      anyFailure = true;
      await output(msg, err);
    }
    //if (!anyFailure){
    if (false){
      // If nothing failed...
      // Switch staging and production
      await msg.send("No failures detected, switching staging and production");
      try {
        res = await exec(`AUTO=true STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/switchStagingProduction.sh`)
      } catch (err) {
        res = err;
      }
      await output(msg, res);
    }
  })

  const switchRegex = /^!switchStagingProduction$/
  robot.hear(switchRegex, async msg => {
    const { brain } = robot;

    // check they have deployment permission
    if (!canDeploy(msg.message.user.id, 'production', brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }

    const {stagingColour, productionColour} = await getColours();
    msg.send(`Will switch staging and production. Current production is ${productionColour}. This will become staging, and staging (currently ${stagingColour}) will become production. Be sure to change the topic in #devops if successful.`)
    let res;
    try {
      res = await exec(`AUTO=true STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/switchStagingProduction.sh`)
    } catch (err) {
      res = err;
    }
    await output(msg, res);

  })

  const syncRegex = /^!deployment sync staging from production$/
  robot.hear(syncRegex, async msg => {
    const { brain } = robot;

    // check they have deployment permission
    if (!canDeploy(msg.message.user.id, 'staging', brain)) {
      return msg.send("You do not have that permission, as far as I can see? Take it up with the admins...");
    }

    const {stagingColour, productionColour} = await getColours();
    msg.send(`Will sync all staging instances (i.e. ${stagingColour} instances) to what is currently on production. Current production is ${productionColour}. `)

    try {
      let res = await Promise.allSettled([
        exec(`AUTO=true NETWORK_ID=100 STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/networkProductionImagesToStaging.sh`),
        exec(`AUTO=true NETWORK_ID=1 STAGING_COLOUR=${stagingColour} PRODUCTION_COLOUR=${productionColour} ./colony-deployment-scripts/networkProductionImagesToStaging.sh`)
      ])
      console.log(res)
      for (let i in res){
        let r = res[i];
        console.log(r);
        if (r.status === 'fulfilled'){
          await output(msg, r.value);
        } else {
          await output(msg, r.reason);
          console.log('single promise failed')
        }
      }
    } catch (err){
      console.log('bigger error');
      await output(msg, err);
    }
  })


}
