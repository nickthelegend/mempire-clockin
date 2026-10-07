import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { explorerAddr, explorerTx, short } from '../chain/solana';
import { FEE_FLOAT_LAMPORTS, SESSION_DAYS } from '../chain/session';
import { haptic } from '../notify';
import { useUi } from '../state/ui';
import { C } from '../theme';
import { Body, Btn, Tag } from '../ui/kit';
import { useSession } from '../wallet/sessionKey';
import { useWallet } from '../wallet/wallet';

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
  const kind = useWallet((s) => s.kind);
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
    } catch (e) { say(e instanceof Error ? e.message : String(e), 'err'); }
  };
  const revoke = async () => {
    try {
      await useSession.getState().revoke();
      haptic.success();
      say('Session revoked on chain · float returned', 'ok');
    } catch (e) { say(e instanceof Error ? e.message : String(e), 'err'); }
  };

  return (
    <View style={st.box} accessible={false}>
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Body size={13} bold color="#fff">Approve once · {SESSION_DAYS} days</Body>
          <Body size={11} color={C.dimOnWood}>
            {on ? `Clock-Ins sign with a session key on this phone · ${left(cur!.expiresAt - now)} left`
              : expired ? 'The session expired. Revoke to return its float, then link a new one.'
              : `One ${kind === 'mwa' ? 'wallet' : 'dev-wallet'} approval links a session key for ${SESSION_DAYS} days; daily Clock-Ins then need no prompt.`}
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
          <View style={[st.row, { marginTop: 6, gap: 6, flexWrap: 'wrap' }]}>
            <Pressable onPress={() => void Linking.openURL(explorerAddr(cur.session))} hitSlop={8} accessibilityRole="link">
              <Tag text={`key ${short(cur.session, 4)} ↗`} color={C.teal} />
            </Pressable>
            <Pressable onPress={() => void Linking.openURL(explorerTx(cur.linkSig))} hitSlop={8} accessibilityRole="link">
              <Tag text={`link ${short(cur.linkSig, 4)} ↗`} color={onChain ? C.teal : C.goldHi} />
            </Pressable>
            <Tag text={`float ${lamports === null ? '…' : (lamports / 1e9).toFixed(5)} SOL`} color={C.dim} />
          </View>
          <Body size={11} color={C.dimOnWood} style={{ marginTop: 4 }}>
            {onChain ? `Ledger: link signed by your wallet, verified on chain · ${chain!.accepted} session Clock-In${chain!.accepted === 1 ? '' : 's'} accepted`
              : chain?.live === null && chain ? 'Ledger: no live link found on chain yet (it may still be confirming).'
              : 'Ledger: reading the link back from chain…'}
          </Body>
          <Btn
            label={expired ? 'REVOKE · RETURN FLOAT' : 'REVOKE'}
            sub="memo on chain · the float goes back to your wallet"
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
