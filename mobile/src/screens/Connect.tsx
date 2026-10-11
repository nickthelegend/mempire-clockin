import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UI_ART, CARD_ART } from '../data/art';
import { BY_TICKER } from '../game/rules';
import { HERO_FIGHTERS } from '../data/showcase';
import { useUi } from '../state/ui';
import { MWA_AVAILABLE, signInLabel, useWallet } from '../wallet/wallet';
import { looksLikeSeeker } from '../chain/seeker';
import { C } from '../theme';
import { Body, Btn, Display, Rise, Tag, Well } from '../ui/kit';
import { GAME_BG, MASCOT } from '../data/cosmeticArt';
import { Hero } from '../ui/Backdrop';

const HERO = HERO_FIGHTERS;

export function ConnectScreen() {
  const connectMwa = useWallet((s) => s.connectMwa);
  const connectDev = useWallet((s) => s.connectDev);
  const say = useUi((s) => s.say);
  const [busy, setBusy] = useState<'mwa' | 'dev' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /**
   * The hero fan mounts one beat after the screen. On iOS (Fabric, image view
   * recycling on by default in RN 0.86) signing out unmounts Home and mounts
   * this screen in the same commit; image views recycled from Home kept
   * showing Home's art (a chest instead of $SOL). Mounting the fan in a later
   * commit gives it image views whose new source is applied.
   */
  const [fan, setFan] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFan(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <Hero source={GAME_BG.home} dim={0.25} />
    <ScrollView contentContainerStyle={st.wrap}>
      <Rise>
        {/* Mounted with the fan, a commit later, for the same image-recycling reason. */}
        <View style={st.logoBox}>
          {fan ? <Image key="logo" source={UI_ART.logo} style={st.logo} resizeMode="contain" accessibilityLabel="Mempire" /> : null}
          {fan ? <Image key="mascot" source={MASCOT.wave} style={{ position: 'absolute', right: -6, top: -10, width: 96, height: 96 }} resizeMode="contain" accessibilityLabel="The Emperor waves" /> : null}
        </View>
      </Rise>
      <Rise delay={60}>
        <View style={st.fan}>
          {fan && HERO.map((t, i) => (
            <LinearGradient
              key={t}
              colors={[`hsl(${BY_TICKER.get(t)?.hue ?? 220},70%,55%)`, `hsl(${BY_TICKER.get(t)?.hue ?? 220},60%,22%)`]}
              style={[st.card, { transform: [{ rotate: `${(i - 2) * 9}deg` }, { translateY: Math.abs(i - 2) * 10 }], zIndex: 5 - Math.abs(i - 2) }]}
            >
              <Image source={CARD_ART[t]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </LinearGradient>
          ))}
        </View>
      </Rise>
      <Rise delay={120}>
        <Display size={30} style={{ textAlign: 'center' }}>Every coin is a fighter.</Display>
        <Body size={15} style={{ textAlign: 'center', marginTop: 6 }}>Clock in daily, build your deck, battle in 3D.</Body>
      </Rise>
      <Rise delay={180} style={{ gap: 12, marginTop: 10, flexDirection: MWA_AVAILABLE ? 'column' : 'column-reverse' }}>
        <Btn
          label="SIGN IN WITH SOLANA"
          sub={MWA_AVAILABLE ? `One tap · ${looksLikeSeeker() ? 'Seed Vault' : 'Seed Vault, Phantom, Solflare'} via Mobile Wallet Adapter` : 'Mobile Wallet Adapter is Android-only'}
          size="lg"
          disabled={!MWA_AVAILABLE}
          busy={busy === 'mwa'}
          onPress={async () => {
            setBusy('mwa'); setErr(null);
            try {
              await connectMwa();
              const p = useWallet.getState().signIn;
              say(p ? `${signInLabel(p)} ✓` : 'Connected. Your wallet skipped the sign-in message.', p ? 'ok' : 'info');
            } catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(m); say(m, 'err'); } finally { setBusy(null); }
          }}
        />
        <Btn
          label="PLAY NOW"
          sub="a practice wallet on this phone · test tokens only"
          tone={MWA_AVAILABLE ? 'ghost' : 'gold'}
          size={MWA_AVAILABLE ? 'md' : 'lg'}
          busy={busy === 'dev'}
          onPress={async () => {
            setBusy('dev');
            try {
              await connectDev();
              if (useWallet.getState().signIn) say('Signed in with Solana ✓', 'ok');
            } catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(`Could not create the practice wallet: ${m}`); } finally { setBusy(null); }
          }}
        />
        {err ? (
          <Well style={{ gap: 6 }}>
            <Body size={13} bold color="#fff">Couldn't reach a wallet</Body>
            <Body size={12}>{err}</Body>
            <Body size={12}>
              You can play right now with Play now and connect your wallet later from Settings.
            </Body>
          </Well>
        ) : null}
      </Rise>
      <Rise delay={240}>
        <Well style={{ gap: 6, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Tag text="TEST TOKENS ONLY" color={C.teal} />
            <Tag text="NO REAL FUNDS" color={C.goldHi} />
          </View>
          <Body size={12}>
            Mempire never asks for a seed phrase. When you connect a wallet, your keys stay in it.
          </Body>
        </Well>
      </Rise>
    </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 70, gap: 16, paddingBottom: 60 },
  logoBox: { height: 100 },
  logo: { width: '78%', height: 100, alignSelf: 'center' },
  fan: { height: 190, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 8 },
  card: { width: 104, height: 138, borderRadius: 12, marginHorizontal: -22, borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)', overflow: 'hidden' },
});
