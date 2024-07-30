import { ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { LOCKED_VOTER_PROGRAM_ACCOUNT, LOCKER } from "@/contains";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { deriveEscrow } from "@/util";
import config from "@/config.toml";
import voteIdl from '@/idl/vote.json'

const JUP_MINT = new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN')
const connection = new Connection(config.solana.rpc, 'confirmed')


/**
 * 是否已经存在托管账户
 * @param walletAccount 钱包账户
 * @returns 
 */
async function ensureEscrowAccount(walletAccount: PublicKey): Promise<[boolean, PublicKey]> {
    const escrow = deriveEscrow(walletAccount)
    const program = new Program(voteIdl as Idl, LOCKED_VOTER_PROGRAM_ACCOUNT, new AnchorProvider(connection, new Wallet(Keypair.generate()), {}))

    try {
        await program.account.escrow.fetch(escrow)
        return [true, escrow]
    } catch (e) {
        return [false, escrow]
    }
}


/**
 * 质押 jup
 * @param payer 钱包
 * @param amount 质押 jup 数量
 * @returns 
 */
export async function stake(payer: Keypair, amount: number): Promise<string> {
    // 1. 查询 JUP 代币账户
    const tokenAccount = await connection.getParsedTokenAccountsByOwner(payer.publicKey, { mint: JUP_MINT })
    // 没有代币账户即没有 jup 代币
    if (tokenAccount.value.length == 0) {
        throw new Error('no token account')
    }
    const balance = tokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount
    // 代币资产不足则终止
    if (parseFloat(balance) < amount) {
        throw new Error('insufficient balance')
    }

    // 2. 构建优先费指令
    const instructions = new Array<TransactionInstruction>(
        ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 100000
        }),
        ComputeBudgetProgram.setComputeUnitLimit({
            units: 400000
        })
    )
    // 3. 查询是否已经存在托管账户，如果没有则先创建托管账户
    const [ensureEscrow, escrow] = await ensureEscrowAccount(payer.publicKey)
    if (!ensureEscrow) {
        instructions.push(createAssociatedTokenAccountInstruction(
            payer.publicKey,
            escrow,
            payer.publicKey,
            JUP_MINT,
            TOKEN_PROGRAM_ID
        ))
    }

    // 4. 查询托管账户是否存在代币账户，如果没有则创建代币账户
    const escrowTokenAccount = await getAssociatedTokenAddress(JUP_MINT, escrow, true)
    const escrowTokenAccountExists = await connection.getAccountInfo(escrowTokenAccount)
    if (!escrowTokenAccountExists) {
        instructions.push(createAssociatedTokenAccountInstruction(
            payer.publicKey,
            escrowTokenAccount,
            escrow,
            JUP_MINT,
            TOKEN_PROGRAM_ID
        ))
    }

    const program = new Program(voteIdl as Idl, LOCKED_VOTER_PROGRAM_ACCOUNT, new AnchorProvider(connection, new Wallet(payer), {}))
    // 5. 构建质押指令
    const stakeInstruction = await program.methods.increaseLockedAmount(amount)
        .accounts({
            escrow,
            escrowTokens: escrowTokenAccount,
            locker: LOCKER,
            payer: payer.publicKey,
            // 钱包代币账户
            sourceTokens: tokenAccount.value[0].pubkey,
            tokenProgram: TOKEN_PROGRAM_ID
        })
        .instruction()
    
    // TODO 确定 toggleMaxLock 指令用途
    const tx = await program.methods.toggleMaxLock(true)
        .accounts({
            escrow,
            locker: LOCKER,
            escrowOwner: payer.publicKey
        })
        // 优先费、创建账户指令放质押指令前
        .preInstructions(instructions)
        .postInstructions([stakeInstruction])
        .rpc()
    
    return tx
}
