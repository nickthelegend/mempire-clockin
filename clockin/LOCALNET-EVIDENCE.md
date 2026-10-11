# Localnet evidence

Written by `scripts/go-devnet.sh` (mobile/scripts/devnet-sweep.ts) on 2026-10-11T16:46:07.012Z.
Cluster: **localnet** (`http://127.0.0.1:4150`). Every row is a real transaction made with the app's own instruction builders against a local validator (the links open Solana Explorer on a custom RPC, so they only resolve while that validator runs).

- Player (sweep wallet): [23whBJbvVpsp7HBEqrtiDBTGMKR1vTSJ8PXHR5FbKj23](https://explorer.solana.com/address/23whBJbvVpsp7HBEqrtiDBTGMKR1vTSJ8PXHR5FbKj23?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- Payer / admin: [Ft7TiUMtzaps1KqRKjcvkSZxQczeYmao7gtYsFYNPjkA](https://explorer.solana.com/address/Ft7TiUMtzaps1KqRKjcvkSZxQczeYmao7gtYsFYNPjkA?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- mempire_pass: [3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G](https://explorer.solana.com/address/3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- SKR stand-in mint: [7wYgHh9BgMBvLrdNotVSoWtvHdJhWCKradKAjS3JBZ36](https://explorer.solana.com/address/7wYgHh9BgMBvLrdNotVSoWtvHdJhWCKradKAjS3JBZ36?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150)
- Player holds the Season Pass: **yes**

| Step | Transaction | What it proves |
|---|---|---|
| fund sweep player | [3SCr6oKk…JgqRcm](https://explorer.solana.com/tx/3SCr6oKkKYpStanGEw2dfE9GgufcRnqxrUiRreYiS8texLBo1J4ZgkPYrYBFxJndxEHUAAa9diWMxLCCyVJgqRcm?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 0.25 SOL to 23whBJbvVpsp7HBEqrtiDBTGMKR1vTSJ8PXHR5FbKj23 |
| Sign In With Solana (off-chain) | — | SIWS message for 23whBJbvVpsp7HBEqrtiDBTGMKR1vTSJ8PXHR5FbKj23 (domain mempire.fun, chain solana:devnet, nonce d85be15abd447748bfa3886c) signed and ed25519-verified with the app's verifier. No transaction: SIWS signs a message. |
| create_session (one owner approval) | [21x1nLNk…9z4SWj](https://explorer.solana.com/tx/21x1nLNkBTcmLFfSeG5sJPeQkUevXa4sEpRHFEGQ6dzGGFi34b64L25hFbDnrVjEf5NvXwg2an4KTaxGux9z4SWj?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | SessionRecord PDA for key 78acauyajNzmhcmVHhEyRbYRdjUn9gSSBd7tQsjth4Wy, expires 2026-10-18T16:45:44.000Z; 0.001 SOL fee float |
| session clock_in + Season War pledge (BONK) | [41XNk6xm…3fjZf1](https://explorer.solana.com/tx/41XNk6xmGGDu9UGXJCozhojUfisu2P4quosWHguYaLjKFs6dUz5N9ayRAL5EWM7xGTLXSG4epdDZvgnhM83fjZf1?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | signed by the session key only; ClockInState day 20261011, streak 1, war side 1 (BONK); memo carries :war=1:side=BONK |
| chest commit (session key) + open + Verify | [31CJBoVc…pVZwnZ](https://explorer.solana.com/tx/31CJBoVc3q5VtMJvz5r9Y1ozgiSEhKnW276SriTwyAyfYhxLLSciC2Ak6CUCzs9DBAgpxxALJSzRkHhWewpVZwnZ?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | commit at slot 38 for target 69; rolled from block 69 (5Qsuq95bw1KD…) → WEN, MICHI, LTC; verifyProof: roll + commit OK |
| claim SKR (faucet mint) | [337oSU1W…zmQyb1](https://explorer.solana.com/tx/337oSU1Wqtntb34QdFNE47vkodeFiAC9hYgC1dYgwbhyN7ngTwfs8MwTigDoPpCkuKyEYUQt7eVqWA6Ki1zmQyb1?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 100 SKR (devnet stand-in 7wYgHh9BgMBvLrdNotVSoWtvHdJhWCKradKAjS3JBZ36) minted to the player by the spl-token-faucet PDA |
| claim SKR #2 | [3GS4Zub4…aycLD6](https://explorer.solana.com/tx/3GS4Zub4gFcTDzWBf7bKq71LjmqUucn8xf4kUbyR3CNeCfou9xaFJotKimuPpX79H64fG7h84zvaj1HwMZaycLD6?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 100 SKR (devnet stand-in 7wYgHh9BgMBvLrdNotVSoWtvHdJhWCKradKAjS3JBZ36) minted to the player by the spl-token-faucet PDA |
| claim SKR #3 | [Ni9ZPHwW…G7RufU](https://explorer.solana.com/tx/Ni9ZPHwWAoA2kYZaqtj75heNywC28rjtnQY9of3rBJfhCMMWp6GvqngwdsPynrwsxBp4JFhByVyZwxm3wG7RufU?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 40 SKR (devnet stand-in 7wYgHh9BgMBvLrdNotVSoWtvHdJhWCKradKAjS3JBZ36) minted to the player by the spl-token-faucet PDA |
| buy Season Pass (Token-2022, soulbound) | [3fW4To5b…tLc5GJ](https://explorer.solana.com/tx/3fW4To5bUoAxXJLDyWWfKkLt1ZmTfgw8gRwRztpYrewHwmPLvBbNoviny6h8xJJcFohXG3ZtLVpL8zJ1dotLc5GJ?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 150 SKR → treasury vault; pass mint J8iJoYwNHHZZFqi7wCLnHDLGyBWdm6gcGygPvFHmpcbS (NonTransferable + MetadataPointer + TokenMetadata) |
| buy skin (Token-2022, Neon Night) | [UYBA654u…toe6ZH](https://explorer.solana.com/tx/UYBA654uuW9PnYyEJikC7rDBkVPNZ6vCHQB77nXtAvHub6VEi4QQzJfqDsGLvf2Jp7rwdmxNaDRYKohC9toe6ZH?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 60 SKR → treasury; skin mint 5jGzciQzV5iWT1s77Xu87iJ8pd6QMiebv3cML92sCCWN |
| shop payment (Streak Shield, transferChecked) | [5kTsPjui…Aak6JS](https://explorer.solana.com/tx/5kTsPjuiVrUQgSdYk2rcQcxmUsJf1mfwYiwbdPjGdwwBNQct6d6wb2zVjN8Cu2CZn2Mo9exm6htux14z8sAak6JS?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 15 SKR to the game treasury |
| ghost duel challenge | [67MH1qjk…YpMqdo](https://explorer.solana.com/tx/67MH1qjkRqpXYJG2bNtUyaxiJCxPN7UPotJBFgohyJNiERud9PLeFzbp2rzxgXeJrdcLYXgS6SnND3z4wXYpMqdo?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | 30-second Rush match, 12 deploys, payload committed by sha256 in the memo |
| ghost duel result (verified by replay) | [2buEqobR…E1mqGZ](https://explorer.solana.com/tx/2buEqobRQEazVkY3pwoJttWDtDitMCpYyjDeMvFkvukAExPNsCEE6wGKjHfTNSHxHtbmCCC5th4Q5V7bfUE1mqGZ?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A4150) | winner d, state hash 5b6a46b7, replay matches |

**All steps succeeded.**
