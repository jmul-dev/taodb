const discovery = require("discovery-swarm");
const swarmDefaults = require("dat-swarm-defaults");

module.exports = (taodb, opts = {}) => {
	const dbKey = taodb.db.key.toString("hex");
	const swarmOpts = Object.assign(
		{
			id: dbKey,
			stream: (peer) => {
				return taodb.replicate();
			}
		},
		opts
	);
	const swarm = discovery(swarmDefaults(swarmOpts));
	swarm.join(dbKey);
	swarm.on("connection", taodb.onConnection.bind(taodb));
	return swarm;
};
