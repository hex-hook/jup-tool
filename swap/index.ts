import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import config from '@/config.toml'
import { createJupiterApiClient, type QuoteResponse } from '@jup-ag/api';

const client = createJupiterApiClient()
const connection = new Connection(config.solana.rpc, "confirmed")

/**
 * jup 兑换
 * @param quoteResponse 交易行情
 * @param payer 签名者
 * @returns 
 */
export async function swap(quoteResponse: QuoteResponse, payer: Keypair) {
    // 1. 获取 jup swap 指令
    const swapResponse = await client.swapPost({
        swapRequest: {
            quoteResponse,
            userPublicKey: payer.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
            // 自动的优先费
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 'auto'
        }
    })

    const transaction = VersionedTransaction.deserialize(Buffer.from(swapResponse.swapTransaction, 'base64'))
    transaction.sign([payer])
    const tx = await connection.sendRawTransaction(transaction.serialize(),
        {
            skipPreflight: true,
            preflightCommitment: 'processed',

        })
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: tx
    });
    return tx
}






