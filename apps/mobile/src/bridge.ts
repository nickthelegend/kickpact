/**
 * Bridge router — move USD₮0 across chains via the USD₮0 / LayerZero OFT.
 *
 * Mirrors WDK's `@tetherto/wdk-protocol-bridge-usdt0-evm` (`Usdt0ProtocolEvm`
 * `quoteBridge` / `bridge`) but implemented in raw ethers (no heavy native
 * deps). OFT contract addresses + LayerZero EIDs are the exact verified values
 * from the WDK module's config. Empty options = 0x0003 and the bytes32
 * recipient = zeroPad(addr,32), both confirmed against @layerzerolabs/lz-v2.
 *
 * This is the rail that funds Polygon for the Polymarket CLOB tier.
 */
import { ethers } from "ethers"

export interface BridgeChain {
  key: string // matches the CHAINS registry key (for logos)
  name: string
  chainId: number
  eid: number // LayerZero endpoint id
  oft: string // USD₮0 OFT contract on this chain
  rpc: string
  explorer: string
}

export const BRIDGE_CHAINS: BridgeChain[] = [
  { key: "ethereum", name: "Ethereum", chainId: 1, eid: 30101, oft: "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io" },
  { key: "arbitrum", name: "Arbitrum", chainId: 42161, eid: 30110, oft: "0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92", rpc: "https://arbitrum-one-rpc.publicnode.com", explorer: "https://arbiscan.io" },
  { key: "optimism", name: "Optimism", chainId: 10, eid: 30111, oft: "0xF03b4d9AC1D5d1E7c4cEf54C2A313b9fe051A0aD", rpc: "https://optimism-rpc.publicnode.com", explorer: "https://optimistic.etherscan.io" },
  { key: "polygon", name: "Polygon", chainId: 137, eid: 30109, oft: "0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com" },
]

const FEE_TOLERANCE = 999n // 0.1% — matches the WDK module

const OFT_ABI = [
  "function token() view returns (address)",
  "function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, bool _payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee) msgFee)",
  "function send((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, (uint256 nativeFee, uint256 lzTokenFee) _fee, address _refundAddress) payable returns ((bytes32 guid, uint64 nonce, (uint256 nativeFee, uint256 lzTokenFee) fee) msgReceipt, (uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)",
]
const ERC20 = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]

function buildSendParam(target: BridgeChain, recipient: string, amount: bigint) {
  return {
    dstEid: target.eid,
    to: ethers.zeroPadValue(recipient, 32), // addressToBytes32
    amountLD: amount,
    minAmountLD: (amount * FEE_TOLERANCE) / 1000n,
    extraOptions: "0x0003", // empty LayerZero type-3 options
    composeMsg: "0x",
    oftCmd: "0x",
  }
}

const providerFor = (c: BridgeChain) => new ethers.JsonRpcProvider(c.rpc, c.chainId, { staticNetwork: true })

/** Read-only quote of the LayerZero messaging fee (native wei) for the hop. */
export async function quoteBridge(opts: {
  source: BridgeChain
  target: BridgeChain
  amount: bigint
  recipient: string
}): Promise<{ bridgeFee: bigint }> {
  const oft = new ethers.Contract(opts.source.oft, OFT_ABI, providerFor(opts.source))
  const sendParam = buildSendParam(opts.target, opts.recipient, opts.amount)
  const fee = await oft.quoteSend(sendParam, false)
  return { bridgeFee: fee.nativeFee }
}

/** Execute the bridge: approve USD₮0 → send via the OFT (pays the LZ fee in native gas). */
export async function bridge(opts: {
  signer: ethers.Signer
  source: BridgeChain
  target: BridgeChain
  amount: bigint
  recipient: string
}): Promise<{ hash: string; bridgeFee: bigint }> {
  const { signer, source, target, amount, recipient } = opts
  const oft = new ethers.Contract(source.oft, OFT_ABI, signer)
  const owner = await signer.getAddress()

  // approve the OFT to pull USD₮0
  const token: string = await oft.token()
  const erc20 = new ethers.Contract(token, ERC20, signer)
  const allowance: bigint = await erc20.allowance(owner, source.oft)
  if (allowance < amount) await (await erc20.approve(source.oft, amount)).wait()

  const sendParam = buildSendParam(target, recipient, amount)
  const { nativeFee } = await oft.quoteSend(sendParam, false)
  const tx = await oft.send(sendParam, { nativeFee, lzTokenFee: 0 }, owner, { value: nativeFee })
  await tx.wait()
  return { hash: tx.hash, bridgeFee: nativeFee }
}

/** USD₮0 balance of `address` on a chain (base units, 6 dp). */
export async function usdt0Balance(chain: BridgeChain, address: string): Promise<bigint> {
  const provider = providerFor(chain)
  const oft = new ethers.Contract(chain.oft, OFT_ABI, provider)
  const token: string = await oft.token()
  const erc20 = new ethers.Contract(token, ERC20, provider)
  return erc20.balanceOf(address)
}
