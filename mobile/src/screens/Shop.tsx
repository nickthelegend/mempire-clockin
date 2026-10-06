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
  icon: { width: 64, height: 64, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
});
