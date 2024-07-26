import { ComputeBudgetProgram, Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from '@solana/web3.js';
import config from '@/config.toml'
import { AnchorProvider, BN, Program, Wallet, type Idl } from '@project-serum/anchor'
import merkleDistributorIdl from './idl.json'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const connection = new Connection(config.solana.rpc, "confirmed")
const lfgApiBaseUrl = 'https://worker.jup.ag/jup-claim-proof';
const lfgDisProgram = 'DiSLRwcSFvtwvMWSs7ubBMvYRaYNYupa76ZSuYLe6D7j';

interface LFGResponse {
    merkle_tree: string
    amount: number
    locked_amount: number
    // claim 时的入参
    proof: number[][]
}

/**
 * 查询是否有资格领取 airdrop
 * @param mint 铸币地址
 * @param address 钱包地址
 * @returns 
 */
export async function getLfgAirdrop(mint: string, address: string): Promise<LFGResponse | null> {
    const resp = await fetch(`${lfgApiBaseUrl}/${mint}/${address}`)
    if (resp.status !== 200) {
        throw new Error(`get airdrop failed ${resp.status}`)
    }
    if (resp.headers.get('Content-Length') == '0') {
        return null
    }
    const data = await resp.json()
    return data as LFGResponse
}

/**
 * 派生 claimStatusAddress 作为 claim 的账户参数
 * @param claimant 钱包地址
 * @param merkleTree 查询资格接口返回的 merkle_tree
 * @returns 
 */
function deriveClaimStatus(
    claimant: string,
    merkleTree: string,
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from('ClaimStatus'),
            new PublicKey(claimant).toBytes(),
            new PublicKey(merkleTree).toBytes(),
        ],
        new PublicKey(lfgDisProgram)
    )[0];
}

/**
 * 领取 airdrop
 * 智能合约参考<a href="https://github.com/jup-ag/distributor/tree/master/programs/merkle-distributor">merkle-distributor</a>
 * @param mint 铸币地址
 * @param payer 钱包
 * @returns 
 */
export async function claim(mint: string, payer: Keypair): Promise<number> {
    // 1. 通过 lfg.jup.ag 查询是否有资格
    const data = await getLfgAirdrop(mint, payer.publicKey.toBase58())
    if (!data) {
        return 0
    }
    console.log(`claim amount: ${data.amount}, locked amount: ${data.locked_amount}`)
    const mintAccount = new PublicKey(mint)

    // 派生 claimStatusAddress 作为 claim 的账户参数
    const claimStatusAddress = deriveClaimStatus(payer.publicKey.toBase58(), data.merkle_tree)
    const from = await getAssociatedTokenAddress(mintAccount, new PublicKey(data.merkle_tree), true)
    const to = await getAssociatedTokenAddress(mintAccount, payer.publicKey, true)

    // 1. 创建代币账户
    const createATAInstruction = createAssociatedTokenAccountInstruction(payer.publicKey, to, payer.publicKey, mintAccount)

    // 2. 调用智能合约 claim
    const provider = new AnchorProvider(connection, new Wallet(payer), {})
    const program = new Program(merkleDistributorIdl as Idl, lfgDisProgram, provider)
    // 参数：解锁数量，锁定数量，merkle proof
    const claimInstruction = await program.methods.newClaim(new BN(data.amount), new BN(data.locked_amount), data.proof).accounts({
        distributor: new PublicKey(lfgDisProgram),
        claimStatus: claimStatusAddress,
        from,
        to,
        claimant: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
    }).instruction()
   
    // 3. 设置优先费
    const unitInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 })
    const priceInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 56000 })

    const transaction = new Transaction().add(...[createATAInstruction, claimInstruction, unitInstruction, priceInstruction])
    const tx = await sendAndConfirmTransaction(connection, transaction, [payer])
    console.log('claim success:', tx)
    return data.amount
}