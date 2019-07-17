const discovery = require("discovery-swarm");
const swarmDefaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const Debug = require("debug");
const debug = Debug(`taodb:swarm`);

module.exports = async (taodb, opts = {}) => {
	const swarmOpts = Object.assign(
		{
			id: taodb.db.local.key,
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
	const dbKey = taodb.addr || taodb.db.key;
	swarm.join(dbKey.toString("hex"));
	swarm.on("connection", taodb.onConnection.bind(taodb));
	swarm.on("connection-closed", (connection, info) => {
		debug(`Disconnected from peer: ${connection.id.toString("hex")}`);
		debug(`# of Peers Connected: ${swarm.connected}`);
	});
	return swarm;
};
