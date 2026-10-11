import { useMemo } from 'react';
import { Image, View } from 'react-native';
import { qrDataUrl } from '../game/qr';

/** A QR code shown with Image (pure-JS encoder, GIF data URL). */
export function Qr({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const { uri } = useMemo(() => qrDataUrl(value), [value]);
  return (
    <View style={{ backgroundColor: '#fff', padding: 6, borderRadius: 12 }}>
      <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={label} />
    </View>
  );
}
