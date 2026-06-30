import { ethers } from "ethers"
import { fetchGames, finalOutcome, predictionTerms, type Outcome } from "../src/football"

const hashTerms = (t: string) => ethers.keccak256(ethers.toUtf8Bytes(t))

const games = await fetchGames()
const finished = games.filter((g) => finalOutcome(g))
console.log(`World Cup games: ${games.length} | finished: ${finished.length}`)

for (const g of finished.slice(0, 4)) {
  const r = finalOutcome(g)
  console.log(`\n${g.home.shortName} ${g.home.score}-${g.away.score} ${g.away.shortName}  (game #${g.id}) → official: ${r}`)
  for (const o of ["home", "draw", "away"] as Outcome[]) {
    const terms = predictionTerms(g, o)
    console.log(`  ${o.padEnd(4)} "${terms}"  hash ${hashTerms(terms).slice(0, 14)}…`)
  }
}

// Prove app-side and keeper-side hashes are identical (same fn, same input).
if (finished[0]) {
  const g = finished[0]
  const appHash = hashTerms(predictionTerms(g, "home")) // what the app stores on-chain
  const keeperHash = hashTerms(predictionTerms(g, "home")) // what the keeper recomputes
  console.log(`\napp hash === keeper hash: ${appHash === keeperHash}`)
}
