const discovery = require("discovery-swarm");
const swarmDefaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const Debug = require("debug");
const debug = Debug(`taodb:swarm`);

module.exports = async (taodb, opts = {}) => {
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
	swarm.once("error", () => {
		swarm.listen(0);
	});
	const availablePort = await getPort();
	swarm.listen(opts.port || availablePort);
	swarm.join(dbKey);
	swarm.on("connection", taodb.onConnection.bind(taodb));
	swarm.on("connection-closed", (connection, info) => {
		debug(`Disconnected from peer: ${connection.id.toString("hex")}`);
		debug(`# of Peers Connected: ${swarm.connected}`);
	});
	return swarm;
};
