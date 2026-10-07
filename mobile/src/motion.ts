import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/**
 * Motion vocabulary for the native screens.
 *
 * - Strong ease-out for anything entering or responding (never ease-in).
 * - UI motion stays under ~300 ms; celebrations (stamp, chest) may run longer.
 * - Reduce Motion: movement is dropped, opacity changes stay.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

let reduce = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduce = v; }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reduce = v; });
export const reduceMotion = (): boolean => reduce;

export function useReduceMotion(): boolean {
  const [v, setV] = useState(reduce);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setV).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setV);
    return () => sub.remove();
  }, []);
  return v;
}

/**
 * A number that counts to its new value instead of jumping. Short (≤600 ms),
 * ease-out, and instant under Reduce Motion or on first render.
 */
export function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (target === from.current) return undefined;
    if (reduce) { from.current = target; setShown(target); return undefined; }
    const start = from.current;
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setShown(Math.round(start + (target - start) * value)));
    Animated.timing(anim, { toValue: 1, duration: ms, easing: EASE_OUT, useNativeDriver: false }).start(() => {
      from.current = target;
      setShown(target);
    });
    return () => { anim.removeListener(id); anim.stopAnimation(); from.current = target; };
  }, [target, ms, anim]);
  return shown;
}
