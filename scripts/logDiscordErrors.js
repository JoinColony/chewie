// Description:
// Logs errors from the discord library, which bubble up by design

module.exports = async function(robot) {
    robot.adapter.client.on('error', function(err) {
      console.log(err);
    });
}
