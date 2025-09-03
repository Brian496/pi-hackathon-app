# Genesis — BitFuture Coin (BFC)

Procedure (prototype):
1. Choose genesis message (e.g., newspaper headline + date)
2. Set time to current UNIX epoch
3. Compute merkleRoot of single coinbase tx (subsidy burned to zero address)
4. Iterate nonce until double-SHA256(header) meets initial target
5. Fix genesis header and record hash

Note: v1 prototype burns the genesis subsidy to keep launch supply at 0.
