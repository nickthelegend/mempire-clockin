import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SHOP, type ShopItemId } from '../game/rules';
import { buy, claimOwedSkr } from '../game/actions';
import { SKR_LABEL, SKR_LIVE, SKR_MAINNET_MINT } from '../chain/skr';
import { explorerTx, short } from '../chain/solana';
import { useGame } from '../state/game';
import { useUi } from '../state/ui';
import { useWallet } from '../wallet/wallet';
import { C } from '../theme';
import { UI_ART } from '../data/art';
import { Body, Btn, ChestArt, Display, Panel, Rise, Tag, Well } from '../ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { ARENA_SKINS, FRAME_SKINS, ownsSkin, usePassChain, type SkinDef } from '../chain/pass';
import { CLUSTER_LABEL } from '../chain/solana';
import { buySkin } from '../game/actions';

/**
 * Thumbnails of each arena skin, cropped from real renders of the native 3D
 * arena on the simulator (clockin/screens/season-pass/12-skins-compare.png).
 */
const ARENA_THUMBS: Record<string, number> = {
  default: require('../../assets/skins/arena-default.png'),
  neon: require('../../assets/skins/arena-neon.png'),
  golden: require('../../assets/skins/arena-golden.png'),
  frozen: require('../../assets/skins/arena-frozen.png'),
};

/** A small picture of what a skin does: a render of the skinned arena, or a card frame. */
export function SkinPreview({ skin, kind, size = 64 }: { skin: SkinDef; kind: 'arena' | 'frame'; size?: number }) {
  if (kind === 'frame') {
    return (
      <LinearGradient colors={skin.colors} style={{ width: size * 0.78, height: size, borderRadius: 10, padding: 4 }}>
        <View style={{ flex: 1, borderRadius: 7, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
          {size >= 56 ? <Body size={10} color="#fff" bold>$SOL</Body> : null}
        </View>
      </LinearGradient>
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
      say(e instanceof Error ? e.message : String(e), 'err');
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
          <Btn
            label={worn ? 'WORN' : 'EQUIP'}
            size="sm"
            tone={worn ? 'ghost' : 'green'}
            disabled={worn}
            onPress={() => { equip(kind === 'arena' ? { arena: s.key } : { frame: s.key }); say(`${s.name} equipped`, 'ok'); }}
          />
        ) : (
          <Btn
            label={`${price} SKR`}
            size="sm"
            tone="skr"
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
        <Tag
          text={pc.status === 'live' ? `ON-CHAIN · ${(pc.skr ?? 0).toLocaleString()} SKR` : pc.status === 'preview' ? 'PREVIEW MODE' : pc.status === 'offline' ? 'CHAIN UNREACHABLE' : 'CHECKING…'}
          color={pc.status === 'live' ? C.skr : C.goldHi}
        />
      </View>
      <Body size={12} color={C.dimOnWood}>
        {pc.status === 'live'
          ? `Each skin is a Token-2022 token with its name and type stored on the mint, sold for SKR in one transaction on ${CLUSTER_LABEL}. Tradable. Cosmetic only.`
          : `On-chain skins available once deployed: preview mode. The mempire_pass program is not on ${CLUSTER_LABEL} yet, so nothing is sold and nothing shows as owned.`}
      </Body>
      <Body size={12} color="#fff" bold style={{ marginTop: 10 }}>Arena skins · field, river, towers, crowd and light</Body>
      <View style={st.skinRow}>{ARENA_SKINS.map((s) => item(s, 'arena'))}</View>
      <Body size={12} color="#fff" bold style={{ marginTop: 10 }}>Card frames</Body>
      <View style={st.skinRow}>{FRAME_SKINS.map((s) => item(s, 'frame'))}</View>
      {sig ? (
        <Pressable onPress={() => void Linking.openURL(explorerTx(sig))} style={{ marginTop: 8 }}>
          <Tag text={`skin tx ${short(sig)} ↗`} color={C.teal} />
        </Pressable>
      ) : null}
      <Btn label="WARDROBE" sub="equip in Deck" tone="ghost" size="sm" style={{ marginTop: 10 }} onPress={() => setTab('deck')} />
    </Panel>
  );
}

function PassEntry() {
  const setPass = useUi((s) => s.setPass);
  return (
    <Btn label="SEASON PASS" sub="free track + premium, priced in SKR" tone="blue" onPress={() => setPass(true)} />
  );
}


export function ShopScreen() {
  const skrChain = useWallet((s) => s.skr);
  const owed = useGame((s) => s.skrSim);
  const shields = useGame((s) => s.streak.shields);
  const sgt = useUi((s) => s.sgt);
  const sgtChecked = useUi((s) => s.sgtChecked);
  const mainnetSkr = useUi((s) => s.mainnetSkr);
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const balance = SKR_LIVE ? (skrChain ?? 0) : owed;

  const purchase = async (id: ShopItemId) => {
    setBusy(id);
    try {
      const r = await buy(id);
      if (r.sig) setLastSig(r.sig);
      say(r.sig ? 'Paid in SKR on devnet ✓' : 'Bought with simulated SKR', 'ok');
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 120 }}>
      <Rise>
        <Display size={28}>SKR Shop</Display>
        <Body size={13}>Earn SKR by clocking in every day. Spend it on keeping the streak — never on power.</Body>
      </Rise>

      <Rise delay={40}>
        <Well style={{ gap: 6 }}>
          <View style={st.between}>
            <View>
              <Body size={12} color={C.skr} bold>{SKR_LABEL.toUpperCase()}</Body>
              <Display size={34} color="#fff">{balance.toLocaleString()}</Display>
            </View>
            <Tag text={SKR_LIVE ? 'DEVNET SPL · 6 DEC' : 'SIMULATED'} color={SKR_LIVE ? C.skr : C.goldHi} />
          </View>
          {SKR_LIVE && owed > 0 ? (
            <Btn
              label={`CLAIM ${owed} OWED SKR`}
              tone="skr"
              size="sm"
              busy={busy === 'claim'}
              onPress={async () => {
                setBusy('claim');
                try { const s = await claimOwedSkr(); setLastSig(s); say('Minted to your wallet ✓', 'ok'); } catch (e) { say(e instanceof Error ? e.message : String(e), 'err'); } finally { setBusy(null); }
              }}
            />
          ) : null}
          <Body size={11} color={C.dim}>
            {SKR_LIVE
              ? 'A devnet stand-in for SKR with the same decimals and token program. Payments are real devnet transferChecked transactions to the game treasury.'
              : `The devnet stand-in mint is not deployed in this build, so this balance is simulated on the device. Real SKR: ${short(SKR_MAINNET_MINT, 6)} (mainnet).`}
          </Body>
          {lastSig ? (
            <Pressable onPress={() => void Linking.openURL(explorerTx(lastSig))}>
              <Tag text={`last tx ${short(lastSig)} ↗`} color={C.teal} />
            </Pressable>
          ) : null}
        </Well>
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
                <Body size={12} color={C.dimOnWood}>{item.blurb}</Body>
                {item.id === 'shield' ? <Body size={11} color={C.gold}>You hold {shields}</Body> : null}
              </View>
            </View>
            <Btn
              label={`${item.price} SKR`}
              tone="skr"
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
            <Display size={18}>Seeker perks</Display>
            <Tag text={sgt ? 'SEEKER VERIFIED' : sgtChecked ? 'NOT DETECTED' : 'CHECKING…'} color={sgt ? C.teal : C.dim} />
          </View>
          <Body size={12}>
            Holding a Seeker Genesis Token doubles the SKR every Clock-In pays. Checked read-only on mainnet against the wallet you connected — Mempire never moves mainnet funds.
          </Body>
          {mainnetSkr !== null ? <Body size={12} color={C.skr}>Mainnet SKR in this wallet: {mainnetSkr.toLocaleString()} (read-only)</Body> : null}
        </Well>
      </Rise>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  skin: {
    width: '31%', minWidth: 96, flexGrow: 1, alignItems: 'center', gap: 6, padding: 8, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
  },
  icon: { width: 64, height: 64, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
});
