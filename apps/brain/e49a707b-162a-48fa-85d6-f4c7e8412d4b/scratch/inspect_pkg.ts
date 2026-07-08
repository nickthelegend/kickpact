import { getSuiClient } from "/Users/alvin/Developer/sui-flow/kickpact/apps/server/src/lib/sui"

async function main() {
  const client = getSuiClient()
  console.log("Client prototype methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
}

main().catch(console.error)
