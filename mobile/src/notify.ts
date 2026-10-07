import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { nextRollover, rolloverLabel } from './game/rules';
import { reminderTime } from './notify.reminders';

/**
 * Two reasons to buzz a phone, and only two: a chest is ready, and today's
 * Clock-In is still open. Both are tagged so they can be withdrawn the moment
 * they stop being true.
 */
export const CHANNEL_ID = 'mempire-v1';

export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Mempire',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'mempire_chime.wav',
    vibrationPattern: [0, 120, 80, 120],
    lightColor: '#FFC422',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function askPermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

async function schedule(id: string, title: string, body: string, at: Date): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    const seconds = Math.max(5, Math.round((at.getTime() - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, sound: 'mempire_chime.wav' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: CHANNEL_ID,
      },
    });
  } catch { /* notifications are a nicety, never a dependency */ }
}

export function cancel(id: string): void {
  void Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Per-wallet id: two wallets can both have a `chest_2`. */
export function chestNotificationId(address: string | null, chestId: string): string {
  return `chest:${address ?? 'none'}:${chestId}`;
}

/** Chest timers: ring when it opens. Cancelled on open, Rush and sign-out. */
export function chestReminder(notificationId: string, name: string, at: number): Promise<void> {
  return schedule(notificationId, `${name} is ready`, 'Tap to open it — new fighters are waiting.', new Date(at));
}

/** Withdraw every pending chest reminder for one wallet (sign-out). */
export async function cancelChestReminders(address: string | null): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = `chest:${address ?? 'none'}:`;
    await Promise.all(all.filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* ignore */ }
}

/**
 * Tomorrow's Clock-In: an evening nudge on the next calendar day, so it lands
 * while the streak can still be saved, not after it is gone.
 */
export const haptic = {
  tap: () => void Haptics.selectionAsync().catch(() => {}),
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  heavy: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

export function ensureStreakReminder(state: 'done' | 'due' | 'lapsed' | 'new', streak: number): void {
  const now = new Date();
  const end = nextRollover(now);
  const resets = rolloverLabel(now);
  if (state === 'done') {
    const nextEnd = new Date(end.getTime() + 86_400_000);
    const at = reminderTime(new Date(end.getTime()), nextEnd);
    if (at) void schedule('streak', `Your ${streak}-day streak is on the line`, `Clock in before ${resets} to keep it, and today's chest is waiting.`, at);
    return;
  }
  const at = reminderTime(now, end);
  if (!at) return;
  void schedule(
    'streak',
    state === 'due' && streak > 0 ? `Your ${streak}-day streak resets at ${resets}` : 'Your daily chest is waiting',
    'One tap to clock in.',
    at,
  );
}
