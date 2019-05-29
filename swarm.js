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
	swarm.on("peer", (peer) => {
		console.log("-- Peer Discovery --");
		console.log("\t - Peer: ", peer);
		console.log("\n");
	});
	swarm.on("peer-banned", (peerAddress, details) => {
		console.log("-- Peer Banned -- ");
		console.log("\t - Peer Address: ", peerAddress);
		console.log("\t - Details: ", details);
		console.log("\n");
	});
	swarm.on("peer-rejected", (peerAddress, details) => {
		console.log("-- Peer Rejected -- ");
		console.log("\t - Peer Address: ", peerAddress);
		console.log("\t - Details: ", details);
		console.log("\n");
	});
	swarm.on("drop", (peer) => {
		console.log("-- Peer Dropped -- ");
		console.log("\t - Peer: ", peer);
		console.log("\n");
	});
	swarm.on("connecting", (peer) => {
		console.log("-- Peer Connecting --");
		console.log("\t - Peer: ", peer);
		console.log("\n");
	});
	swarm.on("connect-failed", (peer, details) => {
		console.log("-- Peer Connect Failed --");
		console.log("\t - Peer: ", peer);
		console.log("\t - Details: ", details);
		console.log("\n");
	});
	swarm.on("handshaking", (connection, info) => {
		console.log("-- Handshaking --");
		console.log("\t - Connection: ", connection);
		console.log("\t - Info: ", info);
		console.log("\n");
	});
	swarm.on("handshake-timeout", (connection, info) => {
		console.log("-- Handshake Timeout --");
		console.log("\t - Connection: ", connection);
		console.log("\t - Info: ", info);
		console.log("\n");
	});
	swarm.on("connection-closed", (connection, info) => {
		console.log("-- Connection closed --");
		console.log("\t - Connection: ", connection);
		console.log("\t - Info: ", info);
		console.log("\n");
	});
	swarm.on("redundant-connection", (connection, info) => {
		console.log("-- Redundant Connection --");
		console.log("\t - Connection: ", connection);
		console.log("\t - Info: ", info);
		console.log("\n");
	});
	return swarm;
};
