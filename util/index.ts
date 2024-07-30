import { LOCKED_VOTER_PROGRAM_ACCOUNT, LOCKER } from "@/contains";
import { PublicKey } from "@solana/web3.js";


/**
 * 派生代管账户
 * @param locker 锁定账户
 * @param walletAccount 钱包账户
 * @param lockedVoter 锁定投票账户
 * @returns 
 */
export function deriveEscrow(walletAccount: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('Escrow'), LOCKER.toBytes(), walletAccount.toBytes()],
        LOCKED_VOTER_PROGRAM_ACCOUNT
    )[0]
}