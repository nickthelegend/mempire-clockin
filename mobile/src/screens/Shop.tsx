import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SHOP, type ShopItemId } from '../game/rules';
import { buy, claimOwedSkr } from '../game/actions';
import { SKR_LIVE, SKR_MINT } from '../chain/skr';
import { explorerAddr, explorerTx, short } from '../chain/solana';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { useWallet } from '../wallet/wallet';
import { C } from '../theme';
import { CARD_ART, UI_ART } from '../data/art';
import { Body, Btn, ChestArt, Display, FrameOverlay, Panel, Rise, SkrIcon, Tag, Well, Ribbon } from '../ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { ARENA_SKINS, FRAME_SKINS, ownsSkin, usePassChain, type SkinDef } from '../chain/pass';

import { buySkin } from '../game/actions';
import { readableError } from '../chain/send';
import { FEATURE_ART, ITEM_ART, PREMIUM_UI, REWARD_ART } from '../data/cosmeticArt';
import { HeroSpace } from '../ui/Backdrop';
import { ProofSeal } from '../ui/ProofSheet';

/**
 * Thumbnails of each arena skin, cropped from real renders of the native 3D
 * arena on the simulator (clockin/screens/season-pass/12-skins-compare.png).
 */
export const ARENA_THUMBS: Record<string, number> = {
  default: require('../../assets/skins/arena-default.png'),
  neon: require('../../assets/skins/arena-neon.png'),
  golden: require('../../assets/skins/arena-golden.png'),
  frozen: require('../../assets/skins/arena-frozen.png'),
};

/** A small picture of what a skin does: a render of the skinned arena, or a card frame. */
export function SkinPreview({ skin, kind, size = 64 }: { skin: SkinDef; kind: 'arena' | 'frame'; size?: number }) {
  if (kind === 'frame') {
    // The frame art over a sample card, at the frame's own portrait shape.
    return (
      <View style={{ width: size * 0.66, height: size }} accessibilityLabel={`${skin.name} card frame preview`}>
        <View style={{ position: 'absolute', left: size * 0.08, right: size * 0.08, top: size * 0.07, bottom: size * 0.07, borderRadius: 6, overflow: 'hidden', backgroundColor: C.ink }}>
          <Image source={CARD_ART.SOL} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
        <FrameOverlay frame={skin.key} inset={0} />
      </View>
    );
  }
  const thumb = ARENA_THUMBS[skin.key];
  if (thumb) {
    return (
      <Image
        source={thumb}
        accessibilityLabel={`${skin.name} arena preview`}
        style={{ width: size, height: size, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' }}
      />
    );
  }
  const [a, b] = skin.colors;
  return (
    <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' }}>
      <LinearGradient colors={[b, a]} style={{ flex: 1 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: size * 0.44, height: size * 0.12, backgroundColor: a, opacity: 0.85 }} />
      <View style={{ position: 'absolute', left: size * 0.18, top: size * 0.2, width: size * 0.16, height: size * 0.16, backgroundColor: '#ffffff', opacity: 0.6, borderRadius: 3 }} />
      <View style={{ position: 'absolute', right: size * 0.18, bottom: size * 0.18, width: size * 0.16, height: size * 0.16, backgroundColor: '#ffffff', opacity: 0.6, borderRadius: 3 }} />
    </View>
  );
}

function Cosmetics() {
  const pc = usePassChain();
  const address = useWallet((s) => s.address);
  const equipped = useGame((s) => s.equipped);
  const equip = useGame((s) => s.equip);
  const setTab = useUi((s) => s.setTab);
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState<number | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const purchase = async (s: SkinDef, kind: 'arena' | 'frame') => {
    setBusy(s.id);
    try {
      const tx = await buySkin(s.id);
      setSig(tx);
      equip(kind === 'arena' ? { arena: s.key } : { frame: s.key });
      say(`${s.name} minted to your wallet and equipped ✓`, 'ok');
    } catch (e) {
      say(readableError(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  const item = (s: SkinDef, kind: 'arena' | 'frame') => {
    const owned = ownsSkin(pc, s.id);
    const onChain = pc.chain?.skins[s.id];
    const price = onChain?.priceSkr ?? s.price;
    const worn = kind === 'arena' ? equipped.arena === s.key : equipped.frame === s.key;
    return (
      <View key={s.id} style={st.skin}>
        <SkinPreview skin={s} kind={kind} size={kind === 'arena' ? 84 : 58} />
        <Body size={12} color="#fff" bold numberOfLines={1}>{s.name}</Body>
        {owned ? (
          worn ? (
            <View style={st.wornPill} accessibilityLabel={`${s.name} equipped`}><Body size={11} bold color={C.teal}>✓ EQUIPPED</Body></View>
          ) : (
            <Btn
              label="EQUIP"
              size="sm"
              tone="green"
              onPress={() => { equip(kind === 'arena' ? { arena: s.key } : { frame: s.key }); say(`${s.name} equipped`, 'ok'); }}
            />
          )
        ) : (
          <Btn
            label={`${price}`}
            icon={ITEM_ART.coin}
            size="sm"
            tone="gold"
            busy={busy === s.id}
            disabled={pc.status !== 'live' || !onChain || !address || (pc.skr ?? 0) < price}
            onPress={() => void purchase(s, kind)}
          />
        )}
      </View>
    );
  };

  return (
    <Panel>
      <View style={st.between}>
        <Display size={20}>Skins</Display>
        {pc.status === 'live' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Image source={PREMIUM_UI.stamp} style={{ width: 22, height: 22 }} />
            <Body size={12} bold color={C.gold}>Owned</Body>
          </View>
        ) : pc.status === 'offline' ? <Tag text="OFFLINE" color={C.dim} /> : null}
      </View>
      <Display size={16} style={{ marginTop: 8 }}>Arena skins</Display>
      <View style={st.skinRow}>{ARENA_SKINS.map((s) => item(s, 'arena'))}</View>
      <Display size={16} style={{ marginTop: 12 }}>Card frames</Display>
      <View style={st.skinRow}>{FRAME_SKINS.map((s) => item(s, 'frame'))}</View>
      {sig ? (
        <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          <ProofSeal info={{ title: 'Skin purchased', art: ARENA_THUMBS.neon, glow: C.purple, about: 'Your skin was minted to your wallet in one transaction, paid in SKR. It is yours to keep or trade.', proofs: [{ label: `purchase ${short(sig, 6)}`, url: explorerTx(sig) }] }} />
        </View>
      ) : null}
      <Btn label="WARDROBE" sub="equip in Deck" tone="ghost" size="sm" style={{ marginTop: 10 }} onPress={() => setTab('deck')} />
    </Panel>
  );
}

function PassEntry() {
  const setPass = useUi((s) => s.setPass);
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image source={REWARD_ART.pass} style={{ width: 84, height: 84 }} resizeMode="contain" />
        <View style={{ flex: 1, gap: 2 }}>
          <Display size={22}>Season 1 Pass</Display>
          <Body size={13}>Premium rewards all season</Body>
        </View>
      </View>
      <Btn label="VIEW" tone="gold" size="sm" style={{ marginTop: 10 }} onPress={() => setPass(true)} />
    </Panel>
  );
}


export function ShopScreen() {
  // The Shop spends on-chain balances: read them fresh when it opens.
  useEffect(() => {
    void useWallet.getState().refresh();
    void usePassChain.getState().refresh(useWallet.getState().address);
  }, []);
  const skrChain = useWallet((s) => s.skr);
  const owed = useGame((s) => s.skrSim);
  const shields = useGame((s) => s.streak.shields);
  const sgt = useUi((s) => s.sgt);
  const sgtChecked = useUi((s) => s.sgtChecked);
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const balance = SKR_LIVE ? (skrChain ?? 0) : owed;

  const purchase = async (id: ShopItemId) => {
    setBusy(id);
    try {
      const r = await buy(id);
      if (r.sig) setLastSig(r.sig);
      say(r.sig ? 'Paid in SKR ✓' : 'Bought ✓', 'ok');
    } catch (e) {
      say(readableError(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 14, gap: 12, paddingBottom: 120 }}>
      <HeroSpace>
        <Ribbon text="SHOP" tone="gold" size={28} />
      </HeroSpace>

      <Rise delay={40}>
        <Panel>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Body size={12} bold>YOUR SKR</Body>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SkrIcon size={44} />
              {SKR_LIVE && skrChain === null
                ? <View style={{ width: 90, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                : <Display size={44} color={C.gold}>{balance.toLocaleString()}</Display>}
            </View>
            {lastSig ? (
              <ProofSeal compact tone="gold" info={{ title: 'SKR payment', art: REWARD_ART.skr, glow: C.skr, about: 'Your SKR went to the game treasury in one transaction. The stand-in SKR on this network has the same decimals and token program as the real one.', proofs: [{ label: `payment ${short(lastSig, 6)}`, url: explorerTx(lastSig) }, ...(SKR_MINT ? [{ label: `SKR ${short(SKR_MINT.toBase58(), 6)}`, url: explorerAddr(SKR_MINT.toBase58()) }] : [])] }} />
            ) : null}
          </View>
          {SKR_LIVE && owed > 0 ? (
            <Btn
              label={`CLAIM ${owed} SKR`}
              icon={ITEM_ART.coin}
              tone="gold"
              size="sm"
              style={{ marginTop: 10 }}
              busy={busy === 'claim'}
              onPress={async () => {
                setBusy('claim');
                try { const s = await claimOwedSkr(); setLastSig(s); say('Minted to your wallet ✓', 'ok'); } catch (e) { say(readableError(e), 'err'); } finally { setBusy(null); }
              }}
            />
          ) : null}
        </Panel>
      </Rise>

      <Rise delay={60}><PassEntry /></Rise>
      <Rise delay={70}><Cosmetics /></Rise>

      {SHOP.map((item, i) => (
        <Rise key={item.id} delay={80 + i * 40}>
          <Panel>
            <View style={st.item}>
              <View style={st.icon}>
                {item.id === 'seeker-chest' ? <ChestArt tier="magic" size={52} />
                  : <Image source={item.id === 'shield' ? UI_ART.clan_badge : UI_ART.chest_open} style={{ width: 50, height: 50 }} resizeMode="contain" />}
              </View>
              <View style={{ flex: 1 }}>
                <Display size={20}>{item.title}</Display>
                <Body size={13} color={C.dim} numberOfLines={3}>{item.blurb}</Body>
                {item.id === 'shield' ? <Body size={11} color={C.gold}>You hold {shields}</Body> : null}
              </View>
            </View>
            <Btn
              label={`${item.price}`}
              icon={ITEM_ART.coin}
              tone="gold"
              size="sm"
              disabled={balance < item.price}
              busy={busy === item.id}
              onPress={() => void purchase(item.id)}
              style={{ marginTop: 10 }}
            />
          </Panel>
        </Rise>
      ))}

      <Rise delay={240}>
        <Well style={{ gap: 6 }}>
          <View style={st.between}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Image source={FEATURE_ART.seeker} style={{ width: 32, height: 32 }} resizeMode="contain" />
              <Display size={18}>Seeker perks</Display>
            </View>
            {sgt ? <Tag text="✓ SEEKER" color={C.teal} /> : sgtChecked ? <Tag text="LOCKED" color={C.dim} /> : null}
          </View>
          <Body size={13}>Seeker owners earn double SKR every day.</Body>
        </Well>
      </Rise>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, justifyContent: 'center' },
  wornPill: {
    minHeight: 38, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    borderWidth: 1.5, borderColor: C.teal, backgroundColor: 'rgba(61,220,151,0.12)',
  },
  skin: {
    width: '31.5%', minWidth: 96, alignItems: 'center', gap: 6, padding: 8, borderRadius: 14,
    backgroundColor: '#18234D', borderWidth: 1, borderColor: 'rgba(247,215,116,0.18)',
  },
  icon: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#18234D', alignItems: 'center', justifyContent: 'center' },
});
