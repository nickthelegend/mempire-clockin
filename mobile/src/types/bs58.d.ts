// The existing web3.js dependency installs bs58 v4, which ships no declarations.
declare module 'bs58' {
  const codec: { encode(bytes: Uint8Array): string; decode(value: string): Uint8Array };
  export default codec;
}
