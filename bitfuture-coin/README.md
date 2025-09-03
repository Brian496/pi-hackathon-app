# BitFuture Coin (BFC)

BitFuture Coin is a minimal Proof-of-Work prototype chain inspired by Bitcoin, configured for fast iteration and testing.

- Consensus: PoW (double-SHA256)
- Target block time: 120 seconds (2 minutes)
- Initial block subsidy: 50 BFC
- Halving cadence: ~4 years (derived from target block time)
- Max supply: 21,000,000 BFC
- Premine: 0 (launch supply = 0)
- Decimals: 8

This first drop will include a single-node reference implementation with local JSON storage, a CPU miner, and a basic CLI. It is not production-ready.

## Roadmap
- Minimal single-node reference implementation (Go)
- Wallet (keygen + balances) and proper addresses
- CPU miner (double-SHA256 over header)
- P2P networking and block gossip
- UTXO model and script validation
- RPC server
- Testnet/regtest params
