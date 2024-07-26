import { getLfgAirdrop } from "@/claim";


async function checkClaim() {
    const cloudMint = 'CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu'
    const address = '7JjL63FmYbDJAmFHtY3bsFJ7ZkC9qTGXCwmS2NRfCtp7'
    const data = await getLfgAirdrop(cloudMint, address)
    console.log(data)

}

checkClaim()