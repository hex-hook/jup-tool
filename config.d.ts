declare module '@/config.toml' {
    type Config = {
        wallet: {
            // 钱包私钥
            privateKey: string
        }
        solana: {
            // rpc 节点
            rpc: string
        }

    }
    const config: Config
    export default config
}