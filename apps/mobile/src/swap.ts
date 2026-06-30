/**
 * Swap router — real on-chain token swaps via the Velora (ParaSwap) aggregator
 * API + ethers. Shaped like WDK's swap module (`quoteSwap` / `swap`) so it can
 * be swapped for `@tetherto/wdk-protocol-swap-velora-evm` later.
 *
 * This is part of Flicky's MAINNET path (Polygon / Ethereum) — the rails that
 * fund the Polymarket CLOB tier. Testnet Pacts/Duels stay on Sepolia.
 */
import { ethers } from "ethers"

const VELORA = "https://api.paraswap.io" // Velora (ParaSwap) aggregator
export const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

export interface Token {
  symbol: string
  address: string
  decimals: number
}

export interface SwapNetwork {
  key: string
  chainId: number
  name: string
  rpc: string
  explorer: string
  tokens: Token[]
}

export const SWAP_NETWORKS: SwapNetwork[] = [
  {
    key: "polygon",
    chainId: 137,
    name: "Polygon",
    rpc: "https://polygon-rpc.com",
    explorer: "https://polygonscan.com",
    tokens: [
      { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
      { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
      { symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
      { symbol: "WMATIC", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
      { symbol: "DAI", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
    ],
  },
  {
    key: "ethereum",
    chainId: 1,
    name: "Ethereum",
    rpc: "https://eth.drpc.org",
    explorer: "https://etherscan.io",
    tokens: [
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
      { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    ],
  },
  {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum",
    rpc: "https://arbitrum.drpc.org",
    explorer: "https://arbiscan.io",
    tokens: [
      { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    ],
  },
  {
    key: "optimism",
    chainId: 10,
    name: "Optimism",
    rpc: "https://optimism.drpc.org",
    explorer: "https://optimistic.etherscan.io",
    tokens: [
      { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
      { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
      { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    ],
  },
  {
    key: "base",
    chainId: 8453,
    name: "Base",
    rpc: "https://base.drpc.org",
    explorer: "https://basescan.org",
    tokens: [
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
      { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
    ],
  },
]

export interface Quote {
  priceRoute: any
  srcAmount: bigint
  destAmount: bigint
  gasCostUSD: string
  srcUSD: string
  destUSD: string
}

/** Real price/route quote from Velora — works for read-only (no signer). */
export async function quoteSwap(opts: {
  network: SwapNetwork
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
}): Promise<Quote> {
  const { network, tokenIn, tokenOut, amountIn } = opts
  const url =
    `${VELORA}/prices?srcToken=${tokenIn.address}&destToken=${tokenOut.address}` +
    `&amount=${amountIn}&srcDecimals=${tokenIn.decimals}&destDecimals=${tokenOut.decimals}` +
    `&side=SELL&network=${network.chainId}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.priceRoute) throw new Error(data.error || "no route")
  const pr = data.priceRoute
  return {
    priceRoute: pr,
    srcAmount: BigInt(pr.srcAmount),
    destAmount: BigInt(pr.destAmount),
    gasCostUSD: pr.gasCostUSD ?? "—",
    srcUSD: pr.srcUSD ?? "—",
    destUSD: pr.destUSD ?? "—",
  }
}

const ERC20 = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]

/**
 * Execute the swap: approve (if needed) → build tx via Velora → send. Requires
 * a signer with funds + gas on the target network.
 */
export async function executeSwap(opts: {
  signer: ethers.Signer
  network: SwapNetwork
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  quote: Quote
  slippageBps?: number // default 100 = 1%
}): Promise<{ hash: string }> {
  const { signer, network, tokenIn, tokenOut, amountIn, quote } = opts
  const slippage = opts.slippageBps ?? 100
  const userAddress = await signer.getAddress()
  const isNative = tokenIn.address.toLowerCase() === NATIVE.toLowerCase()

  // 1) approve the Velora token-transfer proxy if spending an ERC-20
  if (!isNative) {
    const spender = quote.priceRoute.tokenTransferProxy
    const erc20 = new ethers.Contract(tokenIn.address, ERC20, signer)
    const allowance: bigint = await erc20.allowance(userAddress, spender)
    if (allowance < amountIn) {
      await (await erc20.approve(spender, amountIn)).wait()
    }
  }

  // 2) build the swap transaction via Velora
  const minDest = (quote.destAmount * BigInt(10_000 - slippage)) / 10_000n
  const body = {
    srcToken: tokenIn.address,
    destToken: tokenOut.address,
    srcAmount: amountIn.toString(),
    destAmount: minDest.toString(),
    priceRoute: quote.priceRoute,
    userAddress,
    srcDecimals: tokenIn.decimals,
    destDecimals: tokenOut.decimals,
  }
  const txRes = await fetch(`${VELORA}/transactions/${network.chainId}?ignoreChecks=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const tx = await txRes.json()
  if (!tx.to || !tx.data) throw new Error(tx.error || "tx build failed")

  // 3) send
  const sent = await signer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value || "0"),
    gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
  })
  await sent.wait()
  return { hash: sent.hash }
}
