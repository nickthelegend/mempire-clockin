# Devnet evidence

Written by `scripts/go-devnet.sh` (mobile/scripts/devnet-sweep.ts) on 2026-10-11T16:00:12.658Z.
Cluster: **devnet** (`https://api.devnet.solana.com`). Every row is a real transaction made with the app's own instruction builders.

- Player (sweep wallet): [AoG9boGALdoNapF4Qtyz7KtJD2A8cWVPuanGQ89rT6s5](https://explorer.solana.com/address/AoG9boGALdoNapF4Qtyz7KtJD2A8cWVPuanGQ89rT6s5?cluster=devnet)
- Payer / admin: [2vAPj7eES8GafqpZPdPRaPbA14AB8iiLcK5yMfco9HCr](https://explorer.solana.com/address/2vAPj7eES8GafqpZPdPRaPbA14AB8iiLcK5yMfco9HCr?cluster=devnet)
- mempire_pass: [3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G](https://explorer.solana.com/address/3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G?cluster=devnet)
- SKR stand-in mint: [AWruExU2wyLGxFBqAeDs1YtNKJtbo9ucdGKWENaXY6ez](https://explorer.solana.com/address/AWruExU2wyLGxFBqAeDs1YtNKJtbo9ucdGKWENaXY6ez?cluster=devnet)
- Player holds the Season Pass: **yes**

| Step | Transaction | What it proves |
|---|---|---|
| fund sweep player | [47fcydEx…EQR5Dh](https://explorer.solana.com/tx/47fcydExqMvAv4QXSh41NkDW2RzvwwvbwRxYjAkT5DDSm36QXBJSCmS5wKbNVg5dqfvBeY5ZndkjNKBikxEQR5Dh?cluster=devnet) | 0.25 SOL to AoG9boGALdoNapF4Qtyz7KtJD2A8cWVPuanGQ89rT6s5 |
| Sign In With Solana (off-chain) | — | SIWS message for AoG9boGALdoNapF4Qtyz7KtJD2A8cWVPuanGQ89rT6s5 (domain mempire.fun, chain solana:devnet, nonce 7f78c6372c997fbb43293865) signed and ed25519-verified with the app's verifier. No transaction: SIWS signs a message. |
| create_session (one owner approval) | [Fan7oeFj…uxgJzp](https://explorer.solana.com/tx/Fan7oeFjTj4sa3a5thMsNKR8KtgoGwAQ6oFFesnEU7MEzjwsv4wFRkhbU8Z92iZBtcGEyv4hPurZwUui1uxgJzp?cluster=devnet) | SessionRecord PDA for key 8QzFjwC7EVcYX37ohdSgZyPHfcAQrRnL4bBSVwh4DgPZ, expires 2026-10-18T15:59:41.000Z; 0.001 SOL fee float |
| session clock_in + Season War pledge (BONK) | [DXJD2ZcL…4ducjY](https://explorer.solana.com/tx/DXJD2ZcLK7rZqNmhqTpTVUFxj7Ya34tdP2gLheWw6ScdWAuuaj9RQR67KCeCnLonLT2fF4mviky8CCm684ducjY?cluster=devnet) | signed by the session key only; ClockInState day 20261011, streak 1, war side 1 (BONK); memo carries :war=1:side=BONK |
| chest commit (session key) + open + Verify | [5ciGybPY…RbgLYb](https://explorer.solana.com/tx/5ciGybPYpUj6VGe171ywWcmgQaixnyoY6gVgy5Xr9xex9SriGK4gefach1zwNj4nxaTUskPmyRaakbZ327RbgLYb?cluster=devnet) | commit at slot 509955310 for target 509955331; rolled from block 509955331 (8dfmuJMkwy3w…) → PEPE, ETH, LTC; verifyProof: roll + commit OK |
| claim SKR (faucet mint) | [4Ke9nFkV…WHMg5g](https://explorer.solana.com/tx/4Ke9nFkVPUwPLbijVzZuSkWcoUQzRR4nMVPfxR7xs2pa8Esq2mVUQP8xBJYm9AB14r4nBEvuTqRACbCYHzWHMg5g?cluster=devnet) | 100 SKR (devnet stand-in AWruExU2wyLGxFBqAeDs1YtNKJtbo9ucdGKWENaXY6ez) minted to the player by the spl-token-faucet PDA |
| claim SKR #2 | [DGqLorYi…Xo87UX](https://explorer.solana.com/tx/DGqLorYiWC94fBi15swKLALcBqXQDwST5fxCbYTo3zJvYETXi4qcZMfAej5h6u5u6Vvinz1KTFrgUJz5nXo87UX?cluster=devnet) | 100 SKR (devnet stand-in AWruExU2wyLGxFBqAeDs1YtNKJtbo9ucdGKWENaXY6ez) minted to the player by the spl-token-faucet PDA |
| claim SKR #3 | [2rmn7QT3…Sj33mr](https://explorer.solana.com/tx/2rmn7QT3uFqTo7TAqmR7fbgWDtZDeqFd5enB9w5SxRsfbcscVbrzCcTfGLnVSjHwkbjx835SAiR1jLoqgwSj33mr?cluster=devnet) | 40 SKR (devnet stand-in AWruExU2wyLGxFBqAeDs1YtNKJtbo9ucdGKWENaXY6ez) minted to the player by the spl-token-faucet PDA |
| buy Season Pass (Token-2022, soulbound) | [3AHYeqb9…3QDiRA](https://explorer.solana.com/tx/3AHYeqb9mBQ4xGZd7ZiEXvjDevEYNpx1wCZYN42CEzY4yo894Pv5tYvYZQHozh7zABFcsNDsB1vVo2z9YU3QDiRA?cluster=devnet) | 150 SKR → treasury vault; pass mint J8iJoYwNHHZZFqi7wCLnHDLGyBWdm6gcGygPvFHmpcbS (NonTransferable + MetadataPointer + TokenMetadata) |
| buy skin (Token-2022, Neon Night) | [45Xp6xMU…bNxy5L](https://explorer.solana.com/tx/45Xp6xMU3Jv3zD3JVLSM9LWhVJTZyorLFoQAWtoG6fX9mW21mHEhcxS3U6qG63iH13pKrN1keB5B4UuWoVbNxy5L?cluster=devnet) | 60 SKR → treasury; skin mint 5jGzciQzV5iWT1s77Xu87iJ8pd6QMiebv3cML92sCCWN |
| shop payment (Streak Shield, transferChecked) | [3YUxdCpc…vzQCeS](https://explorer.solana.com/tx/3YUxdCpcaQSJGp4J3JzhFsafzcxR6ZCbSXuqZNUW1euckLwdRJ8w6b7u6ftshwpumYNzhA4vQMNNUoZvNavzQCeS?cluster=devnet) | 15 SKR to the game treasury |
| ghost duel challenge | [4TwiYTJC…xZoatC](https://explorer.solana.com/tx/4TwiYTJCzBsM3GAznq9JVWRN1WmGtbhsbP9cFZMmw68aXF2QevBTqUXuoBqvGSHx49cCWHuV73by2KqrTixZoatC?cluster=devnet) | 30-second Rush match, 12 deploys, payload committed by sha256 in the memo |
| ghost duel result (verified by replay) | [4ywxp58m…o4by1Z](https://explorer.solana.com/tx/4ywxp58mJfUgeyLif2qCvj6TYv4ECLU5L41qJ57DZBZzJAFWhGAU6arU2HrNGkduDCiifCrHAbGfnNgHUEo4by1Z?cluster=devnet) | winner d, state hash 4da62e45, replay matches |

**All steps succeeded.**
