import { useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, Switch, View } from 'react-native';
import { explorerAddr, explorerTx, short } from '../chain/solana';
import { FEE_FLOAT_LAMPORTS, SESSION_DAYS } from '../chain/session';
import { haptic } from '../notify';
import { useUi } from '../state/ui';
import { C } from '../theme';
import { Body, Btn } from '../ui/kit';
import { useSession } from '../wallet/sessionKey';
import { useWallet } from '../wallet/wallet';
import { readableError } from '../chain/send';
import { FEATURE_ART } from '../data/cosmeticArt';
import { ProofSeal } from '../ui/ProofSheet';

const left = (sec: number) => {
  if (sec <= 0) return 'expired';
  const d = Math.floor(sec / 86_400); const h = Math.floor((sec % 86_400) / 3600); const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
};

/**
 * "Approve once · 7 days": the session-key toggle on the Clock-In card,
 * with the expiry countdown, the fee float, what the chain says, and Revoke.
 */
export function SessionCard() {
  const cur = useSession((s) => s.cur);
  const lamports = useSession((s) => s.lamports);
  const chain = useSession((s) => s.chain);
  const busy = useSession((s) => s.busy);
  const sol = useWallet((s) => s.sol);
  const say = useUi((s) => s.say);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);

  const on = !!cur && cur.expiresAt > now;
  const expired = !!cur && cur.expiresAt <= now;
  const need = (FEE_FLOAT_LAMPORTS + 10_000) / 1e9;
  const onChain = !!cur && chain?.live?.session === cur.session;

  const enable = async () => {
    if (sol !== null && sol < need) { say(`Linking needs ${need.toFixed(4)} SOL: the fee float plus one fee.`, 'err'); return; }
    try {
      await useSession.getState().enable();
      haptic.success();
      say(`Session key linked for ${SESSION_DAYS} days · Clock-Ins now sign without a wallet prompt`, 'ok');
    } catch (e) { say(readableError(e), 'err'); }
  };
  const revoke = async () => {
    try {
      await useSession.getState().revoke();
      haptic.success();
      say('Session revoked on chain · float returned', 'ok');
    } catch (e) { say(readableError(e), 'err'); }
  };

  return (
    <View style={st.box} accessible={false}>
      <View style={st.row}>
        <Image source={FEATURE_ART.session} style={{ width: 36, height: 36 }} resizeMode="contain" accessibilityLabel="Session key" />
        <View style={{ flex: 1 }}>
          <Body size={13} bold color="#fff">Approve once · {SESSION_DAYS} days</Body>
          <Body size={11} color={C.dimOnWood}>
            {on ? `Daily Clock-Ins need no wallet prompt · ${left(cur!.expiresAt - now)} left`
              : expired ? 'This week is over. Turn it off to get the fee float back, then approve a new week.'
              : `Approve once and play ${SESSION_DAYS} days with no wallet prompts.`}
          </Body>
        </View>
        <Switch
          value={on}
          disabled={busy || expired}
          onValueChange={(v) => { haptic.tap(); void (v ? enable() : revoke()); }}
          trackColor={{ true: C.teal, false: 'rgba(0,0,0,0.4)' }}
          accessibilityLabel={`Approve once for ${SESSION_DAYS} days. ${on ? 'On' : 'Off'}`}
        />
      </View>
      {cur ? (
        <>
          <View style={[st.row, { marginTop: 6, gap: 8, flexWrap: 'wrap' }]}>
            <ProofSeal
              compact
              tone={onChain ? 'teal' : 'gold'}
              info={{ title: 'Approve Once', art: FEATURE_ART.session, glow: C.purple, about: `One approval linked a session key on this phone until ${new Date(cur.expiresAt * 1000).toLocaleDateString()}. The program checks its record on every Clock-In, and a small fee float (${lamports === null ? '…' : (lamports / 1e9).toFixed(4)} SOL) returns to your wallet when you turn it off.`, proofs: [{ label: `link ${short(cur.linkSig, 6)}`, url: explorerTx(cur.linkSig) }, { label: `key ${short(cur.session, 6)}`, url: explorerAddr(cur.session) }] }}
            />
            <Body size={11} color={C.dimOnWood}>
              {onChain ? `${chain!.accepted} Clock-In${chain!.accepted === 1 ? '' : 's'} with no prompt` : 'Tap the seal for proof'}
            </Body>
          </View>
          <Btn
            label={expired ? 'TURN OFF · RETURN FLOAT' : 'TURN OFF'}
            sub="the fee float goes back to your wallet"
            tone="ghost"
            size="sm"
            busy={busy}
            style={{ marginTop: 8 }}
            onPress={() => void revoke()}
          />
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
