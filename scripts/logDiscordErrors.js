// Description:
// Logs errors from the discord library, which bubble up by design

module.exports = async function(robot) {
    robot.client.on('error', function(err) {
      console.log(err);
    });
}
