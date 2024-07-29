import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { Program, BN, AnchorProvider, type Idl, Wallet } from '@coral-xyz/anchor'
import govIdl from './gov_idl.json'
import voteIdl from './vote_idl.json'
import config from '@/config.toml'
import { LOCKED_VOTER_PROGRAM_ACCOUNT, LOCKER } from './contains'
import { deriveEscrow } from './stake'

// jup gov 程序账户
const JUP_GOV_PROGRAM_ACCOUNT = new PublicKey('GovaE4iu227srtG2s3tZzB4RmWBzw8sTwrCLZz7kN7rY');

// gov 账户
const GOVERNOR = new PublicKey('EZjEbaSd1KrTUKHNGhyHj42PxnoK742aGaNNqb9Rcpgu');

const connection = new Connection(config.solana.rpc, 'confirmed')

/**
 * 派生投票账户
 * @param proposal 提案账户
 * @param walletAccount 钱包账户
 * @returns 
 */
function deriveVote(proposal: PublicKey, walletAccount: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('Vote'), proposal.toBytes(), walletAccount.toBytes()],
        JUP_GOV_PROGRAM_ACCOUNT
    )[0]
}


/**
 * 查询是否过投票
 * @param proposal 提案地址
 * @param walletAccount 钱包账户 
 * @returns 
 */
export async function isVoted(proposal: PublicKey, walletAccount: PublicKey): Promise<[boolean, PublicKey]> {
    // 这里只读，不需要使用私钥
    const program = new Program(govIdl as Idl, JUP_GOV_PROGRAM_ACCOUNT, new AnchorProvider(connection, new Wallet(Keypair.generate()), {}))
    const voteAccount = deriveVote(proposal, walletAccount)
    try {
        // 如果查不到投票账户，会抛出异常
        await program.account.vote.fetch(voteAccount)
        return [true, voteAccount]
    } catch (e) {
        console.warn('vote account not found')
        return [false, voteAccount]
    }
}


/**
 * 获取创建投票账户指令
 * 和投票打包到一个交易中
 * @param proposal 提案地址
 * @param payer 钱包
 * @returns 
 */
async function getNewVoteAccountInstruction(proposal: PublicKey, payer: Keypair): Promise<TransactionInstruction> {
    const program = new Program(voteIdl as Idl, LOCKED_VOTER_PROGRAM_ACCOUNT, new AnchorProvider(connection, new Wallet(payer), {}))
    const voteAccount = deriveVote(proposal, payer.publicKey)
    const instruction = await program.methods.newVote(payer.publicKey)
        .accounts({
            proposal,
            vote: voteAccount,
            systemProgram: SystemProgram.programId,
            payer: payer.publicKey
        })
        .instruction()
    return instruction
}


/**
 * 给提案投票
 * @param proposal 提案地址
 * @param payer 钱包
 * @param side 投票选项
 * @returns 
 */
export async function voteProposal(proposal: PublicKey, payer: Keypair, side: number): Promise<string | undefined> {
    const [voted, voteAccount] = await isVoted(proposal, payer.publicKey)
    if (voted) {
        console.log(`proposal [${proposal.toBase58()}]: account [${payer.publicKey.toBase58()}] already voted`)
        return
    }
    const newVoteInstruction = await getNewVoteAccountInstruction(proposal, payer)
    const preInstructions = new Array<TransactionInstruction>(
        ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 100000
        }),
        ComputeBudgetProgram.setComputeUnitLimit({
            units: 400000
        }),
        newVoteInstruction
    )
    const program = new Program(voteIdl as Idl, LOCKED_VOTER_PROGRAM_ACCOUNT, new AnchorProvider(connection, new Wallet(payer), {}))
    const escrowAccount = deriveEscrow(payer.publicKey)
    
    const tx = await program.methods.castVote(new BN(side))
        .accounts({
            escrow: escrowAccount,
            governor: GOVERNOR,
            governProgram: JUP_GOV_PROGRAM_ACCOUNT,
            locker: LOCKER,
            proposal,
            vote: voteAccount,
            voteDelegate: payer.publicKey
        })
        .preInstructions(preInstructions)
        .rpc()
    return tx
}