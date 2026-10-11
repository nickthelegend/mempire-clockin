import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CHAR_ART, EMOTE_ART, REWARD_ART, UI_ICON } from '../data/cosmeticArt';
import { CARD_ART } from '../data/art';
import { hasPremium, passMint, usePassChain, SEASON_ID } from '../chain/pass';
import { CLUSTER_LABEL, explorerAddr, explorerTx, short } from '../chain/solana';
import { buySeasonPass, claimPassTier } from '../game/actions';
import {
  EMOTES, PASS_FRAMES, SEASON, TIERS, canClaim, claimable, rewardLabel, tierFor, tierProgress,
  type Reward, type Track,
} from '../game/season';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { useWallet } from '../wallet/wallet';
import { C, R } from '../theme';
import { Body, Btn, ChestArt, Display, FrameOverlay, Panel, Progress, Tag, Well } from '../ui/kit';
import { readableError } from '../chain/send';

function daysLeft(): number {
  return Math.max(0, Math.ceil((SEASON.endsAt * 1000 - Date.now()) / 86_400_000));
}

function RewardIcon({ r, size = 40 }: { r: Reward; size?: number }) {
  if (r.kind === 'chest') return <ChestArt tier={r.tier} size={size} />;
  if (r.kind === 'frame') {
    // A frame thumbnail: the frame art over a sample card, portrait.
    return (
      <View style={{ width: size * 0.7, height: size }} accessibilityLabel={`${PASS_FRAMES[r.id]?.name ?? r.id} frame`}>
        <View style={{ position: 'absolute', left: size * 0.08, right: size * 0.08, top: size * 0.07, bottom: size * 0.07, borderRadius: 4, overflow: 'hidden', backgroundColor: C.ink }}>
          <Image source={CARD_ART.SOL} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
        <FrameOverlay frame={r.id} inset={0} />
      </View>
    );
  }
  const src = r.kind === 'slot' ? REWARD_ART.slot : r.kind === 'shield' ? REWARD_ART.shield : EMOTE_ART[r.id] ?? REWARD_ART.slot;
  const label = r.kind === 'emote' ? `${EMOTES[r.id]?.label ?? r.id} emote` : r.kind === 'slot' ? 'Chest slot' : 'Streak Shield';
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={label} />;
}

/** The premium card: live (owned / buy), preview (not deployed here), offline. */
function PremiumCard() {
  const address = useWallet((s) => s.address);
  const kind = useWallet((s) => s.kind);
  const pc = usePassChain();
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const premium = hasPremium(pc);
  const price = pc.chain?.season?.priceSkr ?? SEASON.priceSkr;

  const buy = async () => {
    setBusy(true);
    try {
      const s = await buySeasonPass();
      setSig(s);
      say('Season Pass minted to your wallet ✓ Premium unlocked', 'ok');
    } catch (e) {
      say(readableError(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Well style={{ gap: 8, borderColor: premium ? C.gold : 'rgba(0,0,0,0.35)', borderWidth: premium ? 2 : 1 }}>
      <View style={st.between}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Image source={REWARD_ART.pass} style={{ width: 44, height: 44, opacity: premium ? 1 : 0.85 }} resizeMode="contain" accessibilityLabel="Season Pass" />
          <Display size={20} color={premium ? C.gold : '#fff'}>Premium track</Display>
        </View>
        <Tag
          text={premium ? 'PASS HELD · ON-CHAIN' : pc.status === 'live' ? `${price} SKR` : pc.status === 'preview' ? 'PREVIEW MODE' : pc.status === 'offline' ? 'CHAIN UNREACHABLE' : 'CHECKING…'}
          color={premium ? C.gold : pc.status === 'live' ? C.skr : C.dim}
        />
      </View>
      {premium ? (
        <Body size={12} color="#fff">
          This wallet holds the Season {SEASON_ID} pass: a soulbound Token-2022 token (NonTransferable, with its name and season stored on the mint). Premium rewards are unlocked.
        </Body>
      ) : pc.status === 'live' ? (
        <>
          <Body size={12} color="#fff">
            One transaction: {price} SKR goes to the game treasury and a soulbound pass token is minted to your wallet. Cosmetics, chest slots and Streak Shields. Never stats.
          </Body>
          <Body size={12} color={C.skr}>Your on-chain SKR ({CLUSTER_LABEL} stand-in): {(pc.skr ?? 0).toLocaleString()}</Body>
          <Btn
            label={`BUY PASS · ${price} SKR`}
            tone="skr"
            busy={busy}
            disabled={!address || (pc.skr ?? 0) < price}
            onPress={() => void buy()}
            sub={kind === 'mwa' ? 'your wallet approves the transaction' : 'signed by the dev wallet'}
          />
          {(pc.skr ?? 0) < price ? <Body size={11} color={C.dim}>Not enough on-chain SKR yet. Earn it by clocking in.</Body> : null}
        </>
      ) : pc.status === 'preview' ? (
        <Body size={12} color="#fff">
          On-chain pass available once deployed: preview mode. The mempire_pass program is not on {CLUSTER_LABEL} yet, so nothing can be bought and premium stays locked. The free track works now.
        </Body>
      ) : pc.status === 'offline' ? (
        <Body size={12} color="#fff">Can&apos;t reach {CLUSTER_LABEL} right now, so the pass can&apos;t be checked. Premium stays locked until it can. The free track still works.</Body>
      ) : (
        <Body size={12} color="#fff">Reading the pass from {CLUSTER_LABEL}…</Body>
      )}
      {sig ? (
        <Pressable onPress={() => void Linking.openURL(explorerTx(sig))}><Tag text={`tx ${short(sig)} ↗`} color={C.teal} /></Pressable>
      ) : premium ? (
        <Pressable onPress={() => void Linking.openURL(explorerAddr(passMint(SEASON_ID).toBase58()))}>
          <Tag text={`pass mint ${short(passMint(SEASON_ID).toBase58())} ↗`} color={C.teal} />
        </Pressable>
      ) : null}
    </Well>
  );
}

function TierRow({ n, onClaim }: { n: number; onClaim: (n: number, t: Track) => void }) {
  const pass = useGame((s) => s.pass);
  const pc = usePassChain();
  const premium = hasPremium(pc);
  const tier = TIERS.find((t) => t.n === n)!;
  const reached = tierFor(pass.xp) >= n;
  const cell = (track: Track) => {
    const r = track === 'free' ? tier.free : tier.premium;
    if (!r) return <View style={[st.cell, st.cellEmpty]} />;
    const claimed = (track === 'free' ? pass.claimedFree : pass.claimedPremium).includes(n);
    const can = canClaim(pass, n, track, premium);
    const locked = track === 'premium' && !premium;
    return (
      <Pressable
        onPress={can ? () => onClaim(n, track) : undefined}
        disabled={!can}
        accessibilityRole="button"
        accessibilityLabel={`Tier ${n} ${track} reward: ${rewardLabel(r)}${claimed ? ', claimed' : can ? ', claim' : locked ? ', needs the pass' : ', locked'}`}
        style={[st.cell, track === 'premium' && st.cellPremium, can && st.cellReady, { opacity: claimed ? 0.45 : reached ? 1 : 0.7 }]}
      >
        <View>
          <RewardIcon r={r} size={34} />
          {locked && !claimed ? <Image source={UI_ICON.lock} style={st.lockBadge} accessibilityLabel="Needs the pass" /> : null}
          {n === SEASON.tiers && track === 'premium' ? <Image source={CHAR_ART.trophy} style={st.trophyBadge} accessibilityLabel="Season 1 trophy tier" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Body size={11} color="#fff" bold numberOfLines={2}>{rewardLabel(r)}</Body>
          <Body size={10} color={can ? C.teal : C.dim} bold>
            {claimed ? 'CLAIMED' : can ? 'TAP TO CLAIM' : locked ? 'PASS' : reached ? '' : `TIER ${n}`}
          </Body>
        </View>
      </Pressable>
    );
  };
  return (
    <View style={st.row}>
      <View style={[st.badge, reached && { backgroundColor: C.gold }]}>
        <Body size={13} color={reached ? C.ink : '#fff'} bold>{n}</Body>
      </View>
      {cell('free')}
      {cell('premium')}
    </View>
  );
}

export function SeasonPassSheet() {
  const open = useUi((s) => s.passOpen);
  const setPass = useUi((s) => s.setPass);
  const say = useUi((s) => s.say);
  const pass = useGame((s) => s.pass);
  const pc = usePassChain();
  const premium = hasPremium(pc);
  const tier = tierFor(pass.xp);
  const ready = claimable(pass, premium);
  // Opening the pass reads the chain again: SKR balance and pass ownership
  // must be current before the buy button decides anything.
  useEffect(() => {
    if (!open) return;
    const a = useWallet.getState().address;
    void usePassChain.getState().refresh(a);
    void useWallet.getState().refresh();
  }, [open]);

  const onClaim = (n: number, t: Track) => {
    const msg = claimPassTier(n, t);
    if (msg) say(`Tier ${n}: ${msg}`, 'ok');
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setPass(false)}>
      <View style={st.wrap}>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingTop: 60, paddingBottom: 60 }}>
          <View style={st.between}>
            <Image source={CHAR_ART.trophy} style={{ width: 64, height: 64, marginRight: 8 }} resizeMode="contain" accessibilityLabel="Season 1 trophy" />
            <View style={{ flex: 1 }}>
              <Display size={28}>Season Pass</Display>
              <Body size={12}>{SEASON.name} · {daysLeft()} days left</Body>
            </View>
            <Btn label="✕" tone="ghost" size="sm" onPress={() => setPass(false)} />
          </View>

          <Panel>
            <View style={st.between}>
              <Display size={22}>Tier {tier}<Body size={14} color={C.dimOnWood}> / {SEASON.tiers}</Body></Display>
              <Body size={12} color={C.dimOnWood} bold>{pass.xp} XP</Body>
            </View>
            <View style={{ marginTop: 8 }}>
              <Progress value={tierProgress(pass.xp)} color={C.gold} height={12} />
            </View>
            <Body size={11} color={C.dimOnWood} style={{ marginTop: 6 }}>
              XP: Clock-In +60 · quest +25 · all quests +40 · win +40 · draw +20 · loss +15. {SEASON.xpPerTier} XP per tier.
            </Body>
            {ready.length ? (
              <Btn
                label={`CLAIM ALL (${ready.length})`}
                tone="green"
                size="sm"
                style={{ marginTop: 10 }}
                onPress={() => {
                  let got = 0;
                  for (const c of ready) if (claimPassTier(c.n, c.track)) got += 1;
                  if (got) say(`Claimed ${got} reward${got > 1 ? 's' : ''}`, 'ok');
                }}
              />
            ) : null}
          </Panel>

          <PremiumCard />

          <View style={st.headRow}>
            <View style={{ width: 34 }} />
            <Body size={12} bold color="#fff" style={{ flex: 1 }}>FREE</Body>
            <Body size={12} bold color={C.gold} style={{ flex: 1 }}>PREMIUM</Body>
          </View>
          {TIERS.map((t) => <TierRow key={t.n} n={t.n} onClaim={onClaim} />)}

          <Body size={11} color={C.dim}>
            No reward changes a fighter&apos;s stats. Chests use the same odds as everywhere else. Frames and emotes are cosmetic.
          </Body>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1a3d' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 2 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  badge: {
    width: 34, borderRadius: 10, backgroundColor: C.recess, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
  },
  cell: {
    flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8, minHeight: 56,
    borderRadius: R.card, backgroundColor: 'rgba(33,96,196,0.35)', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)',
  },
  cellPremium: { backgroundColor: 'rgba(153,69,255,0.28)' },
  cellReady: { borderColor: C.teal, borderWidth: 2 },
  cellEmpty: { backgroundColor: 'rgba(9,22,48,0.35)' },
  icon: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)' },
  lockBadge: { position: 'absolute', right: -6, bottom: -4, width: 18, height: 18 },
  trophyBadge: { position: 'absolute', left: -8, top: -8, width: 20, height: 20 },
});

