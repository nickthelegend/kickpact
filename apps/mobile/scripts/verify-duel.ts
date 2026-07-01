import { cryptoDeck } from "../src/duel"
import { assetForStrike, fetchTickers, fromStrike, priceLabel, toStrike } from "../src/prices"

const tickers = await fetchTickers()
const deck = await cryptoDeck(3)
console.log("=== live crypto deck (what the creator commits on-chain) ===")
let allMatch = true
for (const card of deck) {
  // what the KEEPER sees on-chain is only the strike — recover the asset from it
  const recovered = assetForStrike(card.strike, tickers)
  const live = recovered ? tickers.get(recovered.symbol)! : null
  const settlePrice = live ? toStrike(live.price) : card.strike
  const actualUp = settlePrice > card.strike
  console.log(
    `strike ${card.strike} (${priceLabel(fromStrike(card.strike))}) → keeper maps to ${recovered?.symbol}` +
      ` · settle ${priceLabel(fromStrike(settlePrice))} → ${actualUp ? "UP" : "DOWN"}`,
  )
  if (!recovered) allMatch = false
}
console.log("\nevery card→asset recovered from strike alone:", allMatch ? "✅" : "❌")
