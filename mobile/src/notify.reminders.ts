/**
 * The streak reminder, in game-day terms (the day ends at 00:00 UTC).
 *
 * The nudge goes out at 19:00 local on the evening before the game day ends,
 * or, if that has passed, 45 minutes before the end. A finished day schedules
 * the same nudge for the next game day. One fixed id, so it never stacks.
 */
export function reminderTime(now: Date, dayEnd: Date): Date | null {
  const latest = dayEnd.getTime() - 30 * 60_000;
  const at = new Date(dayEnd.getTime());
  at.setHours(19, 0, 0, 0);
  while (at.getTime() > latest) at.setDate(at.getDate() - 1);
  if (at.getTime() > now.getTime() + 60_000) return at;
  const late = dayEnd.getTime() - 45 * 60_000;
  return late > now.getTime() + 60_000 ? new Date(late) : null;
}

