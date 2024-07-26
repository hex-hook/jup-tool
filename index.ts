import { swap } from "./swap"
import { claim } from "./claim"
import { Keypair } from "@solana/web3.js"
import { createJupiterApiClient } from "@jup-ag/api"

const client = createJupiterApiClient()

const WSOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

async function main() {
    const mint = 'CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu'
    // 最好提前查询，手动配置
    const decimals = 9
    // 滑点
    const slippageBps = 100

    // TODO 私钥或助记词
    const payer = Keypair.generate()

    // 1. 检查资格并领取代币
    const amount = await claim(mint, payer)
    if (amount === 0) {
        console.warn('No Allocation for this round')
        return
    }
    // 2. 查询交易行情
    const quoteResponse = await client.quoteGet({
        inputMint: mint,
        // 代币兑换 SOL(USDC/SDT)
        outputMint: USDT_MINT,
        amount: amount * Math.pow(10, decimals),
        slippageBps,
    })
    // 通过 quoteResponse.outAmount 兑换到的代币数量是否符合预期
    // 3. 兑换
    await swap(quoteResponse, payer)
}


// main()
