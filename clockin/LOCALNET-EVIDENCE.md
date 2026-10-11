# Localnet evidence

Written by `scripts/go-devnet.sh` (mobile/scripts/devnet-sweep.ts) on 2026-10-11T15:37:48.777Z.
Cluster: **localnet** (`http://127.0.0.1:4150`). Every row is a real transaction made with the app's own instruction builders against a local validator (the links open Solana Explorer on a custom RPC, so they only resolve while that validator runs).

- Player (sweep wallet): [8T2thtANspUZpK66PXY3qNwrC7koQjDfHtV1nGvLUeY](https://explorer.solana.com/address/8T2thtANspUZpK66PXY3qNwrC7koQjDfHtV1nGvLUeY?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- Payer / admin: [9EqNQZU3Cvde8hHTj3mtL4QQj3tAWqzJPTBBJphDd9KR](https://explorer.solana.com/address/9EqNQZU3Cvde8hHTj3mtL4QQj3tAWqzJPTBBJphDd9KR?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- mempire_pass: [3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G](https://explorer.solana.com/address/3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- SKR stand-in mint: [5zabUaez2rkqbXjXggacjtkPbPcTZPakY1VS3ddUaX81](https://explorer.solana.com/address/5zabUaez2rkqbXjXggacjtkPbPcTZPakY1VS3ddUaX81?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- Player holds the Season Pass: **yes**

| Step | Transaction | What it proves |
|---|---|---|
| fund sweep player | [4BpdQByk…ashYjm](https://explorer.solana.com/tx/4BpdQBykFBxf1eiUNLMgs2pZSZ17X4SNFNXMKUSvLTtTYEYoAWV1Zv2UnKgxUnJHy4AUWTi3unBwUZnjzXashYjm?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 0.25 SOL to 8T2thtANspUZpK66PXY3qNwrC7koQjDfHtV1nGvLUeY |
| Sign In With Solana (off-chain) | — | SIWS message for 8T2thtANspUZpK66PXY3qNwrC7koQjDfHtV1nGvLUeY (domain mempire.fun, chain solana:devnet, nonce 452017cfbf49f39566f68124) signed and ed25519-verified with the app's verifier. No transaction: SIWS signs a message. |
| create_session (one owner approval) | [3Rgz48vx…2CsMg9](https://explorer.solana.com/tx/3Rgz48vxGG1KbNxbKJ7VWJ46ixDU6zmQjGJFtei45NiYxt46rhh8ooRnDSWPv42avtWCtqbDqNApmbpogx2CsMg9?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | SessionRecord PDA for key 5RMCCHZzMycg25TNcCvcKgzLdaEJkPJj9bLimfpFHVe6, expires 2026-10-18T15:37:26.000Z; 0.001 SOL fee float |
| session clock_in + Season War pledge (BONK) | [2yE5bZu9…bFgHvJ](https://explorer.solana.com/tx/2yE5bZu9b29YWp1KCR8LL1iSM5vEJCxuDYw62oYWSX3ywtaLxp92mUmvx4yujofMEFPdtSztM29rJeymtDbFgHvJ?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | signed by the session key only; ClockInState day 20261011, streak 1, war side 1 (BONK); memo carries :war=1:side=BONK |
| chest commit (session key) + open + Verify | [4aEmoafg…6ywbrK](https://explorer.solana.com/tx/4aEmoafgpb9GSZqDJhiZcjcNesUnWUajsezeoVgi5HzC1NRtqVMuZbHE4C9tnfLrepjL1hY13AfF2UQiXH6ywbrK?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | commit at slot 36 for target 67; rolled from block 67 (2DRAnSFyNjsf…) → OP, UNI, DOT; verifyProof: roll + commit OK |
| claim SKR (faucet mint) | [3Hzpp6qK…UunRD8](https://explorer.solana.com/tx/3Hzpp6qKHRN5S97UtWEyg5rjzRguhAniJ2yGsNAv8uuxg2jDynfTHAC1DcXMtQPt6jBzv5rMEqkfGit9AiUunRD8?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 100 SKR (devnet stand-in 5zabUaez2rkqbXjXggacjtkPbPcTZPakY1VS3ddUaX81) minted to the player by the spl-token-faucet PDA |
| claim SKR #2 | [4UiVuND8…N5uCBs](https://explorer.solana.com/tx/4UiVuND8BEEwyoC9Yqx5wCxPZ6CJh9orz5AAAQbutPqeYbGqWNGHkdPDGw8noviVShpiSsDYV1STLT4UiHN5uCBs?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 100 SKR (devnet stand-in 5zabUaez2rkqbXjXggacjtkPbPcTZPakY1VS3ddUaX81) minted to the player by the spl-token-faucet PDA |
| claim SKR #3 | [3s1mpzJx…vKmLMv](https://explorer.solana.com/tx/3s1mpzJx6R14eTybPikprsNtyUZGBKCkYBP2zKtpDbkfHife9Pqxd6wGv8JtGwUdwie6nmQ1mc7VngorcMvKmLMv?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 40 SKR (devnet stand-in 5zabUaez2rkqbXjXggacjtkPbPcTZPakY1VS3ddUaX81) minted to the player by the spl-token-faucet PDA |
| buy Season Pass (Token-2022, soulbound) | [4ZXhHosd…CjST3C](https://explorer.solana.com/tx/4ZXhHosdpRDNv7GYarsFKMCjepruLpGXYRkwU9z8gXSqm1iEnrAF2m2HwwizpM28xAH8FWDjmZeYLMwuQRCjST3C?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 150 SKR → treasury vault; pass mint J8iJoYwNHHZZFqi7wCLnHDLGyBWdm6gcGygPvFHmpcbS (NonTransferable + MetadataPointer + TokenMetadata) |
| buy skin (Token-2022, Neon Night) | [2bujN4M2…9zyrwH](https://explorer.solana.com/tx/2bujN4M2DX3NVKsbyYMdSAdhbMDeCYoshpBGu76LNhbiMW9YQVeyu23ANTMYELNhSmeHiAKRMH1J5s4YF39zyrwH?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 60 SKR → treasury; skin mint 5jGzciQzV5iWT1s77Xu87iJ8pd6QMiebv3cML92sCCWN |
| shop payment (Streak Shield, transferChecked) | [4Yoom7Ke…nKKHWh](https://explorer.solana.com/tx/4Yoom7KeUtREDUS7AzjZKUTPy7j3xbBDdBQtMRJ1VEkV9qDfHvYgtmbgqyc9aJdMzUy98rtiRfSav99SomnKKHWh?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 15 SKR to the game treasury |
| ghost duel challenge | [3r3r8AMN…aTV8wr](https://explorer.solana.com/tx/3r3r8AMNHFk9UxZnpkaMMJM3dBjBczQ7NwNk9iH8zWwvuKo5EX5PY1cdjRsmfmwsG7yLPEmiZpvjsbATLwaTV8wr?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 30-second Rush match, 12 deploys, payload committed by sha256 in the memo |
| ghost duel result (verified by replay) | [3D2z5Pj3…aabZVu](https://explorer.solana.com/tx/3D2z5Pj3rrn9gxarfnijFTNLrjySYRVxKAna4DJBiMH8eiK8DqpZcDyQxWaQQ4mfozYt8kdxEfB3W1374XaabZVu?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | winner d, state hash 85d7f6ca, replay matches |

**All steps succeeded.**
