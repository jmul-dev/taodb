# taodb

taodb is a fork of [aodb](https://gitlab.paramation.com/paramation-public/aodb), a distributed scalable database with signature authentication, node validation, and Name's public writer key validation on the contract side on key writes.

# Discovery Keys

| Network       | Network ID | Discovery Key                                                    |
| ------------- | :--------- | :--------------------------------------------------------------- |
| rinkeby       | 4          | 97b5d21affacad43f3e09ab4072c6d9bc515b01637e85378faeab9b823f9f542 |
| local testrpc | 1985       | Use your local discovery key                                     |

## Usage

```js
const taodb = require("taodb");
const swarm = require("taodb/swarm");
const EthCrypto = require("eth-crypto");

// If you already have a writerKey file stored locally
// const { privateKey } = require(PATH_TO_LOCAL_WRITER_KEY_JSON);
// else, create a new writerKey identity
const { privateKey } = EthCrypto.createIdentity();

// For example, we want to initiate taodb on rinkeby network
const taodb = new taodb("./my.db", DISCOVERY_KEY, privateKey);

taodb.db.ready(async (err) => {
	if (err) throw new Error(err);

	try {
		await taodb.setNetworkId(NETWORK_ID);
	} catch (e) {
		console.log(e);
		process.exit();
		return;
	}

	console.log("TAODB ready");
	console.log("TAODB public key: ", taodb.db.key.toString("hex"));
	swarm(taodb);
});
```

## Available Schemas

| Key                                                                  | Value Description               |
| -------------------------------------------------------------------- | :------------------------------ |
| schema/TAO/this/nameId/\*/profileImage                               | Name's base64 profile image     |
| schema/TAO/this/taoId/\*/description/timestamp/%number%              | TAO Description                 |
| schema/TAO/this/taoId/\*/thoughts/thoughtId/%number%/nameId/\*       | Name's Thought for specific TAO |
| schema/TAO/this/nameId/\*/taoId/\*/thoughts/thoughtId/%number%       | Pointer key to ^^               |
| schema/%writerAddress%/AO/Content/\*/\*/signature                    | User Content                    |
| schema/AO/Content/\*/\*/Hosts/%writerAddress%/\*/indexData/signature | Content Host                    |
| schema/AO/Content/\*/\*/Hosts/%writerAddress%/\*/indexData           | Content Host indexData          |
