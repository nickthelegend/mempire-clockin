# Localnet evidence

Written by `scripts/go-devnet.sh` (mobile/scripts/devnet-sweep.ts) on 2026-10-11T15:57:52.779Z.
Cluster: **localnet** (`http://127.0.0.1:4150`). Every row is a real transaction made with the app's own instruction builders against a local validator (the links open Solana Explorer on a custom RPC, so they only resolve while that validator runs).

- Player (sweep wallet): [Hinh3BH3WYsBfJtsY6x2Pc8wFR9p2a4m9uUZyx2VJPjQ](https://explorer.solana.com/address/Hinh3BH3WYsBfJtsY6x2Pc8wFR9p2a4m9uUZyx2VJPjQ?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- Payer / admin: [J5KVBhSWcJ3VZrAgKtWpLp74iufW9ht85GA9FMSf6enM](https://explorer.solana.com/address/J5KVBhSWcJ3VZrAgKtWpLp74iufW9ht85GA9FMSf6enM?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- mempire_pass: [3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G](https://explorer.solana.com/address/3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- SKR stand-in mint: [Bkwb6p65P4XtbFRVRaBbgMcPtbx67Pcjy2zbesTa2BUB](https://explorer.solana.com/address/Bkwb6p65P4XtbFRVRaBbgMcPtbx67Pcjy2zbesTa2BUB?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- Player holds the Season Pass: **yes**

| Step | Transaction | What it proves |
|---|---|---|
| fund sweep player | [4bLtEizN…wwSbrV](https://explorer.solana.com/tx/4bLtEizNad3c5AkBkMgT5vq3zoMNpyHorNAtcHnsHSsFRdRW9dHzYRzXYpgseJZZwcqfidvyHPQuxvw4q1wwSbrV?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 0.25 SOL to Hinh3BH3WYsBfJtsY6x2Pc8wFR9p2a4m9uUZyx2VJPjQ |
| Sign In With Solana (off-chain) | — | SIWS message for Hinh3BH3WYsBfJtsY6x2Pc8wFR9p2a4m9uUZyx2VJPjQ (domain mempire.fun, chain solana:devnet, nonce 2ca89e92cd5e9bb0380f2c00) signed and ed25519-verified with the app's verifier. No transaction: SIWS signs a message. |
| create_session (one owner approval) | [2UF9nYX6…XkSNgc](https://explorer.solana.com/tx/2UF9nYX6PmwBQvq3AbghobaHivRs6EjYh4KuzhYa5SyJ4dCqpbQ2sUL2oXhpFmipViWsAHo3Vhte2tsDiiXkSNgc?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | SessionRecord PDA for key 3toxP9xhPhHwxuUbfZX8acqmYybX4iCudHZ4PinNA6Qd, expires 2026-10-18T15:57:32.000Z; 0.001 SOL fee float |
| session clock_in + Season War pledge (BONK) | [2esXSSTc…7NkLr1](https://explorer.solana.com/tx/2esXSSTcMJe9BqP33kebWhwBb9bgXJ9HQ2La5ehSrVgk3Fugjw4BnbR3qnwLLDoXLzucVG7ULiEQcQGUXX7NkLr1?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | signed by the session key only; ClockInState day 20261011, streak 1, war side 1 (BONK); memo carries :war=1:side=BONK |
| chest commit (session key) + open + Verify | [5Zot5JFW…zeiWiR](https://explorer.solana.com/tx/5Zot5JFWDacgfUzUyEpmPzerM2pFBeuVoXJJgQ6yqXHwXgJboYcZCNg31tKAye1SARdqkNQkuFknTrK8W4zeiWiR?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | commit at slot 39 for target 70; rolled from block 70 (EvBxdwcqLdPV…) → PNUT, GIGA, AI16Z; verifyProof: roll + commit OK |
| claim SKR (faucet mint) | [Deb1mDgQ…QDCVgo](https://explorer.solana.com/tx/Deb1mDgQnutfAvLg3ZRqkJ1HZUvjqAWVELsJ8JJhj7NE7oM48eUR7mmp994PGY2HEcfyTMjVjFy2nf9r8QDCVgo?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 100 SKR (devnet stand-in Bkwb6p65P4XtbFRVRaBbgMcPtbx67Pcjy2zbesTa2BUB) minted to the player by the spl-token-faucet PDA |
| claim SKR #2 | [59Eugn1T…KaUfF3](https://explorer.solana.com/tx/59Eugn1TMy6oZ5Btfa99ZACtfQ1xEmtxmiT2zwkpxfn4EQKWhRAmpYm6p4ZSzE8Uig99FvfyxvCLKcB41VKaUfF3?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 100 SKR (devnet stand-in Bkwb6p65P4XtbFRVRaBbgMcPtbx67Pcjy2zbesTa2BUB) minted to the player by the spl-token-faucet PDA |
| claim SKR #3 | [5hk9Ygz3…izQG9E](https://explorer.solana.com/tx/5hk9Ygz3rmemTE6jZNuBDcsAZgjTg3x8MkUEJagmL6LNmbyfrhqm7f5WfSytaSVAPYvnVdy8Xw2JsuBLjrizQG9E?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 40 SKR (devnet stand-in Bkwb6p65P4XtbFRVRaBbgMcPtbx67Pcjy2zbesTa2BUB) minted to the player by the spl-token-faucet PDA |
| buy Season Pass (Token-2022, soulbound) | [5NL9kVPi…paBUE9](https://explorer.solana.com/tx/5NL9kVPima4HJJx27jhhVGoiaK2CutPeokYb5CaZgmdH9fE1SsAfLBNMuLrpsFuMZKCuoXVT52xBKtuFYppaBUE9?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 150 SKR → treasury vault; pass mint J8iJoYwNHHZZFqi7wCLnHDLGyBWdm6gcGygPvFHmpcbS (NonTransferable + MetadataPointer + TokenMetadata) |
| buy skin (Token-2022, Neon Night) | [5F446Z3X…9xV1ik](https://explorer.solana.com/tx/5F446Z3XuADFXEeW4gHQELktrUgEXB8as9GMbYBeLwHPAeupfe6F4brpykV7kWfLP6GyVnGEGH8Yo2tAwY9xV1ik?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 60 SKR → treasury; skin mint 5jGzciQzV5iWT1s77Xu87iJ8pd6QMiebv3cML92sCCWN |
| shop payment (Streak Shield, transferChecked) | [5aW1YiCU…jUKJBZ](https://explorer.solana.com/tx/5aW1YiCU6GVeVd8Wz8TmeT5f3gXGiakDUX3mvPc8NGpV6QkHoRVv6cddWKt5y4QsVXkmg8jkGRcWtG7CcdjUKJBZ?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 15 SKR to the game treasury |
| ghost duel challenge | [X7s1QFCc…Pt4vMg](https://explorer.solana.com/tx/X7s1QFCcPCfrK7rNzNnaPhmnh7DxCwsiR8fSxqngW45qeJotJyDKhVkppbUf5rnNa4NCWCGkqJyMbPrdBPt4vMg?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 30-second Rush match, 12 deploys, payload committed by sha256 in the memo |
| ghost duel result (verified by replay) | [62z9LyCx…qzk7iW](https://explorer.solana.com/tx/62z9LyCx2Uhv8D3T62bjLgvnR7JMokf5QwmXAxfv5QAiaDRgLZHejTiVKLoKPVHmyhoqFDLfTaXonHbrayqzk7iW?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | winner d, state hash e4d9ea76, replay matches |

**All steps succeeded.**
