const discovery = require("discovery-swarm");
const swarmDefaults = require("dat-swarm-defaults");

module.exports = (taodb) => {
	const dbKey = taodb.db.key.toString("hex");
	const swarm = discovery(
		swarmDefaults({
			id: dbKey,
			stream: (peer) => {
				return taodb.replicate();
			}
		})
	);

	swarm.join(dbKey);

	swarm.on("connection", taodb.onConnection.bind(taodb));
	return swarm;
};
