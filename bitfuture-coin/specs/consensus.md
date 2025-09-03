# Consensus — BitFuture Coin (BFC)

- Proof-of-Work: double-SHA256(header)
- Target block time: 120s
- Difficulty retarget: every 2016 blocks; adjust to keep average ≈120s
- Bounds: 4× max upward/downward change per period (Bitcoin-like)
- Subsidy: starts at 50 BFC, halves every ~4 years (≈1,051,200 blocks)
- Max supply: 21,000,000 BFC

Header (simplified):
- version, prevHash, merkleRoot, time, nBits, nonce

Block valid if:
- doubleSHA256(header) <= targetFrom(nBits)
- transactions valid; first is coinbase with current subsidy

This spec keeps v1 simple for local prototype usage.
