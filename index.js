const aodb = require("aodb");
const events = require("events");
const inherits = require("inherits");
const promisify = require("tiny-promisify");
const EthCrypto = require("eth-crypto");
const Web3 = require("web3");
const NamePublicKey = require("ao-contracts/build/contracts/NamePublicKey.json");
const NameTAOPosition = require("ao-contracts/build/contracts/NameTAOPosition.json");
const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

class TAODB {
	constructor(storage, key, localETHPrivateKey, opts) {
		if (!(this instanceof TAODB)) return new TAODB(storage, key, localETHPrivateKey, opts);
		if (!opts) opts = {};
		events.EventEmitter.call(this);
		const self = this;

		try {
			self.setLocalETHPrivateKey(localETHPrivateKey);
		} catch (e) {
			console.log(e);
			return false;
		}
		self.networkId = null;
		self.namePublicKey = null;
		self.nameTAOPosition = null;
		self.db = key
			? new aodb(storage, key, { valueEncoding: "json", reduce: (a, b) => a })
			: new aodb(storage, { valueEncoding: "json", reduce: (a, b) => a });
	}

	setLocalETHPrivateKey(key) {
		const self = this;
		if (!key) {
			throw new Error("Missing localETHPrivateKey param");
		}
		self.localETHPrivateKey = key;
		self.writerAddress = EthCrypto.publicKeyByPrivateKey(key);
		self.writerKey = EthCrypto.publicKey.toAddress(self.writerAddress);
		self.contractCaller = { from: self.writerKey };
	}

	async setNetworkId(networkId) {
		const self = this;
		if (networkId !== 1 && networkId !== 4 && networkId !== 1985) {
			throw new Error("Invalid networkId");
		}
		switch (networkId) {
			case 1:
				self.web3 = new Web3(new Web3.providers.WebsocketProvider("wss://mainnet.infura.io/ws"));
				break;
			case 4:
				self.web3 = new Web3(new Web3.providers.WebsocketProvider("wss://rinkeby.infura.io/ws"));
				break;
			default:
				self.web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
				break;
		}
		const connectedNetworkId = await promisify(self.web3.eth.net.getId)();
		if (!connectedNetworkId) {
			throw new Error("Unable to connect to network");
		} else if (connectedNetworkId !== networkId) {
			throw new Error("Invalid network connected");
		}
		const deployedNetworks = Object.keys(NamePublicKey.networks);
		if (deployedNetworks.indexOf(networkId.toString()) === -1) {
			throw new Error("Contracts not deployed to target network");
		}
		self.networkId = networkId;
		self.namePublicKey = new self.web3.eth.Contract(NamePublicKey.abi, NamePublicKey.networks[self.networkId].address);
		self.nameTAOPosition = new self.web3.eth.Contract(NameTAOPosition.abi, NameTAOPosition.networks[self.networkId].address);
	}

	/**
	 * When a connection is made, auto-authorizes new peers to write to local database
	 * @param peer - The discovery-swarm peer emitted from the 'connection' or 'disconnection' event
	 */
	onConnection(peer) {
		const self = this;
		console.log("Peer connected: " + peer.id.toString("hex"));

		if (!peer.remoteUserData) {
			console.log("Missing remote peer user data");
			return;
		}

		let remoteUserData;
		try {
			remoteUserData = JSON.parse(peer.remoteUserData);
		} catch (e) {
			console.log(e);
			return;
		}

		if (
			!remoteUserData.hasOwnProperty("key") ||
			!remoteUserData.hasOwnProperty("writerAddress") ||
			!remoteUserData.hasOwnProperty("writerSignature")
		) {
			console.log("Remote user data is missing key/writerAddress/writerSignature properties");
			return;
		}
		const remotePeerKey = Buffer.from(remoteUserData.key);
		const signer = EthCrypto.recoverPublicKey(
			remoteUserData.writerSignature,
			self.db.createSignHash("swarm", {
				discoveryKey: self.db.key.toString("hex"),
				peerKey: remotePeerKey.toString("hex")
			})
		);
		if (signer !== remoteUserData.writerAddress) {
			console.log("Signer does not match the writerAddress. Will not authorize the connected peer: " + peer.id.toString("hex"));
			return;
		}

		self.db.authorized(remotePeerKey, (err, auth) => {
			if (err) {
				console.log(err);
				return;
			}
			if (!auth) {
				self.db.authorize(remotePeerKey, (err) => {
					if (err) {
						console.log(err);
						return;
					}
					console.log(peer.id.toString("hex"), " was just authorized");
				});
			} else {
				console.log(peer.id.toString("hex"), " authorized");
			}
		});
	}

	replicate() {
		return this.db.replicate({
			live: true,
			userData: JSON.stringify({
				key: this.db.local.key,
				writerAddress: this.writerAddress,
				writerSignature: EthCrypto.sign(
					this.localETHPrivateKey,
					this.db.createSignHash("swarm", {
						discoveryKey: this.db.key.toString("hex"),
						peerKey: this.db.local.key.toString("hex")
					})
				)
			})
		});
	}

	insert(key, value, schemaKey, opts) {
		return new Promise(async (resolve, reject) => {
			if (!opts) opts = {};
			opts.schemaKey = schemaKey;

			// Make sure writer key have permission to write
			await this._validateKeyWrite(key, reject);

			this.db.put(
				key,
				value,
				EthCrypto.sign(this.localETHPrivateKey, this.db.createSignHash(key, value)),
				this.writerAddress,
				opts,
				(err) => {
					if (err) reject(err);
					resolve();
				}
			);
		});
	}

	query(key, opts) {
		return new Promise((resolve, reject) => {
			this.db.get(key, opts, (err, node) => {
				if (err) reject(err);
				if (node) resolve(node.value);
				reject(null);
			});
		});
	}

	exists(key) {
		return new Promise((resolve, reject) => {
			this.db.get(key, (err, node) => {
				if (err) resolve(false);
				if (node) resolve(true);
				resolve(false);
			});
		});
	}

	list(key, opts) {
		return new Promise((resolve, reject) => {
			this.db.list(key, opts, (err, nodes) => {
				if (err) reject(err);
				if (nodes.length) {
					const result = [];
					for (let i = 0; i < nodes.length; i++) {
						const node = nodes[i];
						let nodeSplit = node.key.split("/");
						result.push(nodeSplit);
					}
					resolve(result);
				} else {
					resolve([]);
				}
			});
		});
	}

	listValue(key, opts) {
		return new Promise((resolve, reject) => {
			this.db.list(key, opts, (err, nodes) => {
				if (err) reject(err);
				if (nodes.length) {
					const result = [];
					for (let i = 0; i < nodes.length; i++) {
						const node = nodes[i];
						const splitKey = node.key.split("/");
						result.push({
							key: node.key,
							splitKey,
							value: node.value
						});
					}
					resolve(result);
				} else {
					resolve([]);
				}
			});
		});
	}

	count(key, opts) {
		return new Promise((resolve, reject) => {
			this.db.list(key, opts, (err, nodes) => {
				if (err) resolve(0);
				resolve(nodes.length);
			});
		});
	}

	watch(key) {
		return new Promise((resolve, reject) => {
			const watcher = this.db.watch(key, () => {});
			watcher.on("watching", () => {
				console.log("Watching for change on key: " + key);
			});
			watcher.on("change", () => {
				console.log("Detected change on key: " + key);
				watcher.destroy();
				resolve();
			});
		});
	}

	delete(key) {
		return new Promise(async (resolve, reject) => {
			// Make sure writer key have permission to write
			await this._validateKeyWrite(key, reject);

			this.db.del(key, EthCrypto.sign(this.localETHPrivateKey, this.db.createSignHash(key, "")), this.writerAddress, (err) => {
				if (err) reject(err);
				resolve();
			});
		});
	}

	addSchema(key, value) {
		return new Promise((resolve, reject) => {
			this.db.addSchema(
				key,
				value,
				EthCrypto.sign(this.localETHPrivateKey, this.db.createSignHash(key, value)),
				this.writerAddress,
				(err) => {
					if (err) reject(err);
					resolve();
				}
			);
		});
	}

	async _validateKeyWrite(key, reject) {
		try {
			const self = this;
			if (!self.networkId) {
				reject("Unable to determine networkId");
			}
			if (!self.namePublicKey) {
				reject("Unable to determine NamePublicKey contract");
			}
			if (!self.nameTAOPosition) {
				reject("Unable to determine NameTAOPosition contract");
			}
			if (!self.writerKey) {
				reject("Unable to determine local writerKey");
			}
			if (!self.contractCaller) {
				reject("Unable to determine the contract caller");
			}
			const splitKey = key.split("/");
			const nameIdFieldIndex = splitKey.indexOf("nameId");
			const taoIdFieldIndex = splitKey.indexOf("taoId");
			if (nameIdFieldIndex >= 0 && nameIdFieldIndex + 1 < splitKey.length) {
				const nameId = splitKey[nameIdFieldIndex + 1];
				const isExist = await promisify(self.nameTAOPosition.methods.isExist(nameId).call)(self.contractCaller);
				if (!isExist) {
					reject("Invalid nameId:" + nameId);
				}
				// Check if local writerKey is the writerKey of the Name
				if (self.web3.utils.isAddress(nameId) && nameId !== EMPTY_ADDRESS) {
					const isNameWriterKey = await promisify(self.namePublicKey.methods.isNameWriterKey(nameId, self.writerKey).call)(
						self.contractCaller
					);
					if (!isNameWriterKey) {
						reject("Local writerKey doesn't match Name's writerKey");
					}
				}
			} else if (taoIdFieldIndex >= 0 && taoIdFieldIndex + 1 < splitKey.length) {
				const taoId = splitKey[taoIdFieldIndex + 1];
				const isExist = await promisify(self.nameTAOPosition.methods.isExist(taoId).call)(self.contractCaller);
				if (!isExist) {
					reject("Invalid taoId:" + taoId);
				}
				if (self.web3.utils.isAddress(taoId) && taoId !== EMPTY_ADDRESS) {
					// Get the Advocate of this taoId
					const advocateId = await promisify(self.nameTAOPosition.methods.getAdvocate(taoId).call)(self.contractCaller);

					// Check if local writerKey is the writerKey of the Advocate
					if (self.web3.utils.isAddress(advocateId) && advocateId !== EMPTY_ADDRESS) {
						const isNameWriterKey = await promisify(
							self.namePublicKey.methods.isNameWriterKey(advocateId, self.writerKey).call
						)(self.contractCaller);
						if (!isNameWriterKey) {
							reject("Local writerKey doesn't match Advocate's writerKey");
						}
					}
				}
			}
		} catch (e) {
			reject(e);
		}
	}
}

module.exports = TAODB;

inherits(TAODB, events.EventEmitter);
