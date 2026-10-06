import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { UI_ART, CARD_ART } from '../data/art';
import { useUi } from '../state/ui';
import { MWA_AVAILABLE, useWallet } from '../wallet/wallet';
import { C } from '../theme';
import { Body, Btn, Display, Rise, Tag, Well } from '../ui/kit';

const HERO = ['BTC', 'BONK', 'SOL', 'WIF', 'NVDA'];

export function ConnectScreen() {
  const connectMwa = useWallet((s) => s.connectMwa);
  const connectDev = useWallet((s) => s.connectDev);
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState<'mwa' | 'dev' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <Rise><Image source={UI_ART.logo} style={st.logo} resizeMode="contain" accessibilityLabel="Mempire" /></Rise>
      <Rise delay={60}>
        <View style={st.fan}>
          {HERO.map((t, i) => (
            <Image
              key={t}
              source={CARD_ART[t]}
              style={[st.card, { transform: [{ rotate: `${(i - 2) * 9}deg` }, { translateY: Math.abs(i - 2) * 10 }], zIndex: 5 - Math.abs(i - 2) }]}
            />
          ))}
        </View>
      </Rise>
      <Rise delay={120}>
        <Display size={30} style={{ textAlign: 'center' }}>Every coin is a fighter.</Display>
        <Body size={15} style={{ textAlign: 'center', marginTop: 6 }}>
          Clock in daily for chests and SKR, build a deck of eight, and battle in a 3D arena. Your AI coach scouts every rival on your phone.
        </Body>
      </Rise>
      <Rise delay={180} style={{ gap: 12, marginTop: 10 }}>
        <Btn
          label="CONNECT WALLET"
          sub={MWA_AVAILABLE ? 'Seed Vault · Phantom · Solflare via Mobile Wallet Adapter' : 'Mobile Wallet Adapter is Android-only'}
          size="lg"
          disabled={!MWA_AVAILABLE}
          busy={busy === 'mwa'}
          onPress={async () => {
            setBusy('mwa'); setErr(null);
            try { await connectMwa(); } catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(m); say(m, 'err'); } finally { setBusy(null); }
          }}
        />
        <Btn
          label="USE DEV WALLET"
          sub="a devnet-only key kept on this device"
          tone="ghost"
          busy={busy === 'dev'}
          onPress={async () => {
            setBusy('dev');
            try { await connectDev(); } finally { setBusy(null); }
          }}
        />
        {err ? <Body size={12} color={C.red} style={{ textAlign: 'center' }}>{err}</Body> : null}
      </Rise>
      <Rise delay={240}>
        <Well style={{ gap: 6, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Tag text="SOLANA DEVNET" color={C.teal} />
            <Tag text="NO REAL FUNDS" color={C.goldHi} />
          </View>
          <Body size={12}>
            Every on-chain action in this build is on devnet. Mempire never asks for a seed phrase; with Mobile Wallet Adapter your keys stay in your wallet.
          </Body>
        </Well>
      </Rise>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 70, gap: 16, paddingBottom: 60 },
  logo: { width: '78%', height: 100, alignSelf: 'center' },
  fan: { height: 190, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 8 },
  card: { width: 104, height: 138, borderRadius: 12, marginHorizontal: -22, borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)' },
});
