import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ALL_SKINS, PASS_PROGRAM, hasPremium, ownsSkin, passMint, usePassChain, SEASON_ID } from '../chain/pass';
import { clockStatePda, programLive, readClockState, type ClockState } from '../chain/clockin';
import { CLUSTER_LABEL, connection, explorerAddr, explorerTx, short } from '../chain/solana';
import { SKR_LABEL, SKR_LIVE, SKR_MINT } from '../chain/skr';
import { ACTIONS_BASE, actionUrl, blinkUrl } from '../game/blink';
import { SEASON_WAR } from '../game/board';
import { useDuels } from '../state/duels';
import { useGame } from '../state/game';
import { useIdentity } from '../state/identity';
import { useUi } from '../state/ui';
import { useWar } from '../state/war';
import { useSession } from '../wallet/sessionKey';
import { useWallet } from '../wallet/wallet';
import { C, R } from '../theme';
import { Body, Btn, Display, Tag } from '../ui/kit';

/**
 * "On-chain": every Solana feature Mempire uses, with its live status on the
 * current cluster and an explorer link. Read-only; each source keeps its own
 * cache (pass/skins, war tally, duel board), and the Clock-In record and
 * program check are read once per open.
 */
type Tone = 'live' | 'off' | 'pending' | 'info';
const TONE: Record<Tone, string> = { live: C.teal, off: C.dim, pending: C.goldHi, info: C.bluePale };

function Row({ title, chip, tone, children, links }: {
  title: string; chip: string; tone: Tone; children?: React.ReactNode; links?: { label: string; url: string }[];
}) {
  return (
    <View style={st.row}>
      <View style={st.head}>
        <Body size={14} bold color="#fff" style={{ flex: 1 }}>{title}</Body>
        <Tag text={chip} color={TONE[tone]} />
      </View>
      {children}
      {links?.length ? (
        <View style={st.links}>
          {links.map((l) => (
            <Pressable key={l.url} onPress={() => void Linking.openURL(l.url)} hitSlop={8} accessibilityRole="link" accessibilityLabel={l.label}>
              <Tag text={`${l.label} ↗`} color={C.teal} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
const Line = ({ children }: { children: React.ReactNode }) => <Body size={12} color={C.dim}>{children}</Body>;

export function OnChainSheet() {
  const open = useUi((s) => s.onchainOpen);
  const setOpen = useUi((s) => s.setOnchain);
  const address = useWallet((s) => s.address);
  const signIn = useWallet((s) => s.signIn);
  const kind = useWallet((s) => s.kind);
  const session = useSession((s) => s.cur);
  const sessionChain = useSession((s) => s.chain);
  const pc = usePassChain();
  const chests = useGame((s) => s.chests);
  const warSide = useGame((s) => s.warSide);
  const war = useWar((s) => s.board);
  const duels = useDuels((s) => s.board);
  const sgt = useUi((s) => s.sgt);
  const sgtChecked = useUi((s) => s.sgtChecked);
  const skrName = useIdentity((s) => (address ? s.names[address] : undefined));
  const [live, setLive] = useState<boolean | null>(null);
  const [state, setState] = useState<ClockState | null | undefined>(undefined);
  const [passBlink, setPassBlink] = useState<'on' | 'off' | null>(null);

  useEffect(() => {
    if (!open || !address) return;
    let gone = false;
    void programLive(connection).then((ok) => { if (!gone) setLive(ok); });
    void readClockState(connection, address).then((s) => { if (!gone) setState(s); }).catch(() => { if (!gone) setState(null); });
    void usePassChain.getState().refresh(address);
    if (!useWar.getState().board) void useWar.getState().refresh();
    if (!useDuels.getState().loadedAt) void useDuels.getState().refresh();
    if (!useIdentity.getState().names[address]) void useIdentity.getState().resolve(address).catch(() => null);
    void fetch(`${ACTIONS_BASE}/api/actions/season-pass`).then((r) => r.json()).then((j: { disabled?: boolean }) => { if (!gone) setPassBlink(j.disabled ? 'off' : 'on'); }).catch(() => {});
    return () => { gone = true; };
  }, [open, address]);

  if (!address) return null;
  const notDeployed = live === false;
  const final = 'deploys at final step';
  const commit = [...chests].reverse().find((c) => c.commit?.commitSig)?.commit;
  const myChallenges = duels.filter((d) => d.signer === address && d.memo.kind === 'challenge').map((d) => d.sig);
  const received = duels.filter((d) => d.signer !== address && d.memo.kind === 'result' && myChallenges.includes(d.memo.challengeSig));
  const heldSkins = ALL_SKINS.filter((s) => ownsSkin(pc, s.id));

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
      <View style={st.wrap}>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingTop: 60, paddingBottom: 60 }}>
          <View style={st.head}>
            <View style={{ flex: 1 }}>
              <Display size={28}>On-chain</Display>
              <Body size={12}>Live from Solana {CLUSTER_LABEL} · read-only</Body>
            </View>
            <Btn label="✕" tone="ghost" size="sm" onPress={() => setOpen(false)} />
          </View>

          <Row title="Sign In With Solana" tone={signIn ? 'live' : 'off'} chip={signIn ? 'VERIFIED ON THIS PHONE' : 'NOT SIGNED'}>
            <Line>{signIn ? `${signIn.method === 'dev-local' ? 'Dev wallet' : signIn.signer} · ${signIn.domain} · ${signIn.chainId ?? ''} · issued ${new Date(signIn.issuedAt).toLocaleString()}` : `${kind === 'mwa' ? 'Your wallet skipped the sign-in message.' : 'Sign out and in again to sign the SIWS message.'}`}</Line>
            <Line>Off-chain by design: a signed message, verified with ed25519 on the device.</Line>
          </Row>

          <Row
            title="Session key (approve once)"
            tone={notDeployed ? 'pending' : session ? 'live' : 'off'}
            chip={session ? (notDeployed ? `MEMO LINK · ${final}` : `EXPIRES ${new Date(session.expiresAt * 1000).toLocaleDateString()}`) : 'OFF'}
            links={session ? [{ label: `key ${short(session.session)}`, url: explorerAddr(session.session) }, { label: 'link tx', url: explorerTx(session.linkSig) }] : undefined}
          >
            <Line>{session ? `SessionRecord PDA checked by mempire_pass on every Clock-In${sessionChain ? ` · ${sessionChain.accepted} session Clock-In(s) accepted from chain` : ''}.` : 'Turn on "Approve once · 7 days" on the Clock-In card.'}</Line>
          </Row>

          <Row
            title="Clock-In record (PDA)"
            tone={notDeployed ? 'pending' : state ? 'live' : 'off'}
            chip={notDeployed ? final : state ? `STREAK ${state.streak} · BEST ${state.best}` : state === null ? 'NO CLOCK-IN YET' : 'READING…'}
            links={notDeployed ? undefined : [{ label: `PDA ${short(clockStatePda(new PublicKey(address)).toBase58())}`, url: explorerAddr(clockStatePda(new PublicKey(address)).toBase58()) }]}
          >
            <Line>{state ? `Last UTC day ${state.lastDay} · ${state.total} Clock-In(s) · war side ${['none', 'BONK', 'POPCAT'][state.warSide] ?? state.warSide}. Day and streak are computed by the program.` : notDeployed ? 'Until mempire_pass is on this cluster, Clock-Ins are signed memos (still on chain, rebuilt from history).' : 'Your first Clock-In creates it.'}</Line>
          </Row>

          <Row
            title="Chest commits"
            tone={commit ? 'live' : 'off'}
            chip={commit ? `SLOT ${commit.commitTxSlot ?? '?'} → ${commit.targetSlot}` : 'NONE ON CHAIN YET'}
            links={commit?.commitSig ? [{ label: `commit ${short(commit.commitSig)}`, url: explorerTx(commit.commitSig) }] : undefined}
          >
            <Line>Each chest is committed to a future slot before its block exists; open one and tap Verify to recompute the roll from chain.</Line>
          </Row>

          <Row
            title="Season Pass (Token-2022, soulbound)"
            tone={pc.status === 'preview' ? 'pending' : hasPremium(pc) ? 'live' : 'off'}
            chip={pc.status === 'preview' ? final : pc.status !== 'live' ? 'CHECKING…' : hasPremium(pc) ? 'HELD' : 'NOT HELD'}
            links={pc.status === 'live' ? [{ label: `pass mint ${short(passMint(SEASON_ID).toBase58())}`, url: explorerAddr(passMint(SEASON_ID).toBase58()) }, { label: 'program', url: explorerAddr(PASS_PROGRAM.toBase58()) }] : undefined}
          >
            <Line>{pc.status === 'live' ? `NonTransferable + MetadataPointer + TokenMetadata · on-chain ${SKR_LABEL}: ${(pc.skr ?? 0).toLocaleString()}` : 'Ownership is read from Token-2022 balances only; nothing is faked.'}</Line>
          </Row>

          <Row
            title="Skins (Token-2022)"
            tone={pc.status === 'preview' ? 'pending' : heldSkins.length ? 'live' : 'off'}
            chip={pc.status === 'preview' ? final : `${heldSkins.length} / ${ALL_SKINS.length} HELD`}
            links={heldSkins.slice(0, 3).map((s) => ({ label: s.name, url: explorerAddr(pc.chain!.skins[s.id].mint.toBase58()) }))}
          />

          <Row
            title="SKR"
            tone={SKR_LIVE ? 'live' : 'pending'}
            chip={SKR_LIVE ? 'DEVNET STAND-IN' : `SIMULATED · ${final}`}
            links={SKR_MINT ? [{ label: `mint ${short(SKR_MINT.toBase58())}`, url: explorerAddr(SKR_MINT.toBase58()) }] : undefined}
          >
            <Line>Classic SPL, 6 decimals, minted by the public spl-token-faucet program. Real SKR stays on mainnet.</Line>
          </Row>

          <Row title="Ghost duels" tone={myChallenges.length ? 'live' : 'off'} chip={`${myChallenges.length} SENT · ${received.length} RESULTS IN`}
            links={myChallenges.slice(0, 2).map((s) => ({ label: `challenge ${short(s)}`, url: explorerTx(s) }))}>
            <Line>Replays, results and accepts are memos on a shared reference key, re-simulated on the phone.</Line>
          </Row>

          <Row title={`Season War · ${SEASON_WAR.title}`} tone={war ? 'live' : 'off'}
            chip={war ? SEASON_WAR.sides.map((s) => `${s} ${war.sides[s]?.clockIns ?? 0}`).join(' · ') : 'READING…'}>
            <Line>{`Pledged Clock-Ins per side, tallied from chain by every phone.${warSide ? ` You fight for $${warSide}.` : ''}`}</Line>
          </Row>

          <Row title="Blinks (Solana Actions)" tone={passBlink === 'on' ? 'live' : 'info'}
            chip={passBlink === 'on' ? 'SEASON PASS BLINK LIVE' : passBlink === 'off' ? `CHALLENGE LIVE · PASS ${final}` : 'CHALLENGE LIVE'}
            links={[{ label: 'challenge Blink', url: blinkUrl(1) }, { label: 'action', url: actionUrl(1) }, { label: 'actions.json', url: `${ACTIONS_BASE}/actions.json` }]} />

          <Row title="Seeker identity" tone={sgt || skrName ? 'live' : 'off'}
            chip={sgt ? 'GENESIS TOKEN ✓' : sgtChecked ? 'NO GENESIS TOKEN' : kind === 'dev' ? 'DEV WALLET' : 'CHECKING…'}
            links={sgt ? [{ label: 'Genesis Token', url: `https://explorer.solana.com/address/${sgt}` }] : undefined}>
            <Line>{skrName ? `${skrName} (.skr, AllDomains, mainnet read)` : 'No .skr name for this wallet.'} · Seeker Genesis Token holders earn double SKR (read-only mainnet check).</Line>
          </Row>

          <Body size={11} color={C.dim}>Nothing on this screen signs or sends anything.</Body>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1a3d' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { backgroundColor: C.recess, borderRadius: R.card, padding: 12, gap: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
