import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CHAR_ART, EMOTE_ART, ITEM_ART, REWARD_ART, UI_ICON, GAME_BG, MASCOT, PREMIUM_UI } from '../data/cosmeticArt';
import { CARD_ART } from '../data/art';
import { hasPremium, passMint, usePassChain, SEASON_ID } from '../chain/pass';
import { explorerAddr, explorerTx, short } from '../chain/solana';
import { buySeasonPass, claimPassTier } from '../game/actions';
import {
  EMOTES, PASS_FRAMES, SEASON, TIERS, canClaim, claimable, rewardLabel, tierFor, tierProgress,
  XP, type Reward, type Track,
} from '../game/season';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { useWallet } from '../wallet/wallet';
import { C, R } from '../theme';
import { Body, Btn, ChestArt, Display, FrameOverlay, Panel, Progress, SkrIcon, Tag, Well, Ribbon } from '../ui/kit';
import { readableError } from '../chain/send';
import { ProofSeal } from '../ui/ProofSheet';
import { Celebrate, usePopIn } from '../ui/Celebrate';
import { haptic } from '../notify';
import { DriftBackground, HeroCaption, HeroSpace } from '../ui/Backdrop';
import { InfoButton } from '../ui/InfoButton';

/** A soft placeholder while the pass is read (never "loading…" text). */
function Shimmerish() {
  return <View style={{ height: 14, width: '70%', borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.12)' }} />;
}

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
  const [burst, setBurst] = useState<number | null>(null);
  const [cheer, setCheer] = useState(false);
  const premium = hasPremium(pc);
  const price = pc.chain?.season?.priceSkr ?? SEASON.priceSkr;

  const buy = async () => {
    setBusy(true);
    try {
      const s = await buySeasonPass();
      setSig(s);
      setBurst(Date.now());
      setCheer(true);
      haptic.success();
      say('Season Pass unlocked! Premium rewards are yours', 'ok');
    } catch (e) {
      say(readableError(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Well style={{ gap: 8, borderColor: premium ? C.gold : 'rgba(0,0,0,0.35)', borderWidth: premium ? 2 : 1, overflow: 'visible' }}>
      <Celebrate burst={burst} size={300} />
      {cheer ? <CheerPop /> : null}
      <View style={st.between}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Image source={REWARD_ART.pass} style={{ width: 44, height: 44, opacity: premium ? 1 : 0.85 }} resizeMode="contain" accessibilityLabel="Season Pass" />
          <Display size={20} color={premium ? C.gold : '#fff'}>Premium track</Display>
        </View>
        <Tag
          text={premium ? 'PREMIUM ✓' : pc.status === 'live' ? `${price} SKR` : pc.status === 'preview' ? 'SOON' : pc.status === 'offline' ? 'OFFLINE' : ' '}
          color={premium ? C.gold : pc.status === 'live' ? C.skr : C.dim}
        />
      </View>
      {premium ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={PREMIUM_UI.stamp} style={{ width: 26, height: 26 }} />
          <View style={{ flex: 1 }}>
            <Body size={14} bold color={C.gold}>Pass owned</Body>
            <Body size={11} color={C.dim}>Yours alone: it can&apos;t be sold or sent</Body>
          </View>
          <ProofSeal compact tone="gold" info={{ title: 'Season Pass', art: REWARD_ART.pass, glow: C.gold, about: 'A soulbound token: it cannot be sold or sent, so the pass is yours alone. The game reads it from your wallet every time.', proofs: [...(sig ? [{ label: `purchase ${short(sig, 6)}`, url: explorerTx(sig) }] : []), { label: `pass ${short(passMint(SEASON_ID).toBase58(), 6)}`, url: explorerAddr(passMint(SEASON_ID).toBase58()) }] }} />
        </View>
      ) : pc.status === 'live' ? (
        <>
          <Body size={12} color="#fff">
            One transaction: {price} SKR goes to the game treasury and a soulbound pass token is minted to your wallet. Cosmetics, chest slots and Streak Shields. Never stats.
          </Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><SkrIcon size={20} /><Display size={20} color={C.skr}>{(pc.skr ?? 0).toLocaleString()}</Display><Body size={12} color={C.dim}>in your wallet</Body></View>
          <Btn
            label={`BUY PASS · ${price} SKR`}
            tone="skr"
            busy={busy}
            disabled={!address || (pc.skr ?? 0) < price}
            onPress={() => void buy()}
            sub={kind === 'mwa' ? 'your wallet approves the transaction' : 'signed by your practice wallet'}
          />
          {(pc.skr ?? 0) < price ? <Body size={11} color={C.dim}>Not enough on-chain SKR yet. Earn it by clocking in.</Body> : null}
        </>
      ) : pc.status === 'preview' ? (
        <Body size={12} color="#fff">
          The premium pass opens soon. The free track works now.
        </Body>
      ) : pc.status === 'offline' ? (
        <Body size={12} color="#fff">The network is busy, so your pass can&apos;t be checked right now. The free track still works.</Body>
      ) : (
        <Shimmerish />
      )}
      {sig && !premium ? (
        <ProofSeal compact tone="gold" info={{ title: 'Season Pass', art: REWARD_ART.pass, glow: C.gold, about: 'A soulbound token: it cannot be sold or sent, so the pass is yours alone. The game reads it from your wallet every time.', proofs: [...(sig ? [{ label: `purchase ${short(sig, 6)}`, url: explorerTx(sig) }] : []), { label: `pass ${short(passMint(SEASON_ID).toBase58(), 6)}`, url: explorerAddr(passMint(SEASON_ID).toBase58()) }] }} />
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
    if (!r) {
      // No free reward on this tier: a dim coin, so the column never looks broken.
      return (
        <View style={[st.cell, st.cellEmpty]}>
          <Image source={ITEM_ART.coin} style={{ width: 30, height: 30, opacity: 0.22 }} resizeMode="contain" />
          <Body size={11} color="rgba(169,180,217,0.55)" bold>Premium only</Body>
        </View>
      );
    }
    const claimed = (track === 'free' ? pass.claimedFree : pass.claimedPremium).includes(n);
    const can = canClaim(pass, n, track, premium);
    const locked = track === 'premium' && !premium;
    return (
      <Pressable
        onPress={can ? () => onClaim(n, track) : undefined}
        disabled={!can}
        accessibilityRole="button"
        accessibilityLabel={`Tier ${n} ${track} reward: ${rewardLabel(r)}${claimed ? ', claimed' : can ? ', claim' : locked ? ', needs the pass' : ', locked'}`}
        style={[st.cell, track === 'premium' && st.cellPremium, !reached && !claimed && (track === 'premium' ? st.cellFuturePremium : st.cellFuture), can && st.cellReady]}
      >
        <View>
          <RewardIcon r={r} size={34} />
          {claimed ? <Image source={PREMIUM_UI.stamp} style={st.claimCheck} resizeMode="contain" accessibilityLabel="Claimed" /> : null}
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
  const current = tierFor(pass.xp) + 1 === n;
  return (
    <View style={st.row}>
      <TierBadge n={n} reached={reached} current={current} />
      {cell('free')}
      {cell('premium')}
    </View>
  );
}

/** The tier number; the next tier to reach pulses gold. */
function TierBadge({ n, reached, current }: { n: number; reached: boolean; current: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [current, v]);
  return (
    <Animated.View style={[st.badge, reached && { backgroundColor: C.gold }, current && { borderColor: C.gold, borderWidth: 2, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }], shadowColor: C.gold, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]}>
      <Body size={13} color={reached ? '#3A2200' : '#fff'} bold>{n}</Body>
    </Animated.View>
  );
}

function CheerPop() {
  const v = usePopIn(true);
  return <Animated.Image source={MASCOT.cheer} style={{ position: 'absolute', right: -6, top: -40, width: 110, height: 110, transform: [{ scale: v }] }} resizeMode="contain" />;
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
        <DriftBackground source={GAME_BG.home} dim={0.5} />
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingTop: 54, paddingBottom: 60 }}>
          <View style={st.between}>
            <View />
            <Btn label="✕" tone="ghost" size="sm" onPress={() => setPass(false)} />
          </View>
          <HeroSpace offset={110}>
            <Image source={PREMIUM_UI.seasonCrown} style={{ width: 110, height: 110 }} resizeMode="contain" accessibilityLabel="Season 1 crown" />
            <Ribbon text="SEASON PASS" tone="purple" size={26} />
            <HeroCaption>{daysLeft()} days left</HeroCaption>
          </HeroSpace>

          <Panel>
            <View style={st.between}>
              <Display size={22}>Tier {tier}<Body size={14} color={C.dimOnWood}> / {SEASON.tiers}</Body></Display>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Body size={12} color={C.dimOnWood} bold>{pass.xp} XP</Body>
                <InfoButton inline title="How XP works" art={PREMIUM_UI.seasonCrown} lines={[
                  `Clock-In +${XP.clockin} · quest +${XP.quest} · all three quests +${XP.questBonus}`,
                  `Win +${XP.win} · draw +${XP.draw} · loss +${XP.loss}`,
                  `${SEASON.xpPerTier} XP per tier, ${SEASON.tiers} tiers`,
                  'No reward changes a fighter\'s stats. Frames and emotes are cosmetic.',
                ]} />
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <Progress value={tierProgress(pass.xp)} color={C.gold} height={12} />
            </View>

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

        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0A1028' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 2 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  badge: {
    width: 34, borderRadius: 10, backgroundColor: C.recess, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
  },
  cell: {
    flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8, minHeight: 56,
    borderRadius: R.card, backgroundColor: '#1A2A63', borderWidth: 1.5, borderColor: 'rgba(157,178,255,0.18)',
  },
  cellPremium: { backgroundColor: '#2C1D63', borderColor: 'rgba(155,108,255,0.35)' },
  // Tiers not reached yet: a deeper solid tile (never see-through over the hero art).
  cellFuture: { backgroundColor: '#152152', borderColor: 'rgba(157,178,255,0.1)' },
  cellFuturePremium: { backgroundColor: '#22184F', borderColor: 'rgba(155,108,255,0.2)' },
  cellReady: { borderColor: C.teal, borderWidth: 2 },
  claimCheck: { position: 'absolute', right: -10, top: -10, width: 28, height: 28 },
  cellEmpty: { backgroundColor: C.woodDark, borderColor: 'rgba(255,255,255,0.05)' },
  icon: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)' },
  lockBadge: { position: 'absolute', right: -6, bottom: -4, width: 18, height: 18 },
  trophyBadge: { position: 'absolute', left: -8, top: -8, width: 20, height: 20 },
});

