import qrcode from 'qrcode-generator';

/** A QR code from pure JS (qrcode-generator) as a GIF data URL; no native module. */
export function qrDataUrl(text: string, cell = 6, margin = 4): { uri: string; modules: number } {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return { uri: q.createDataURL(cell, margin), modules: q.getModuleCount() };
}
