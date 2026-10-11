import type { ImageSourcePropType } from 'react-native';

/**
 * Game art (Mempire style, transparent): emotes, Season Pass rewards, card
 * frames, the SKR coin, feature icons, characters and UI icons. WebP at the
 * size the app draws them, built from the PNG masters in art-src/cosmetics by
 * scripts/build-cosmetics.sh. Nothing here is drawn in code.
 * Frame keys match the shop catalog (src/data/skins.json) and PASS_FRAMES.
 */
export const EMOTE_ART: Record<string, ImageSourcePropType> = {
  gm: require('../../assets/cosmetics/emotes/gm.webp'),
  gg: require('../../assets/cosmetics/emotes/gg.webp'),
  lfg: require('../../assets/cosmetics/emotes/lfg.webp'),
  wagmi: require('../../assets/cosmetics/emotes/wagmi.webp'),
  hodl: require('../../assets/cosmetics/emotes/hodl.webp'),
};

/** Portrait frames with a hollow centre, drawn over the card art. */
export const FRAME_ART: Record<string, ImageSourcePropType> = {
  goldleaf: require('../../assets/cosmetics/frames/goldleaf.webp'),
  cyber: require('../../assets/cosmetics/frames/cyber.webp'),
  frost: require('../../assets/cosmetics/frames/frost.webp'),
  magma: require('../../assets/cosmetics/frames/magma.webp'),
  pixel: require('../../assets/cosmetics/frames/pixel.webp'),
  clockwork: require('../../assets/cosmetics/frames/clockwork.webp'),
  laurel: require('../../assets/cosmetics/frames/laurel.webp'),
};

export const REWARD_ART = {
  shield: require('../../assets/cosmetics/rewards/shield.webp') as ImageSourcePropType,
  slot: require('../../assets/cosmetics/rewards/slot.webp') as ImageSourcePropType,
  pass: require('../../assets/cosmetics/rewards/pass.webp') as ImageSourcePropType,
  skr: require('../../assets/cosmetics/rewards/skr.webp') as ImageSourcePropType,
};

/** One icon per on-chain feature (On-chain screen rows and their entry points). */
export const FEATURE_ART = {
  siws: require('../../assets/cosmetics/features/siws.webp') as ImageSourcePropType,
  session: require('../../assets/cosmetics/features/session.webp') as ImageSourcePropType,
  clockin: require('../../assets/cosmetics/features/clockin.webp') as ImageSourcePropType,
  commit: require('../../assets/cosmetics/features/commit.webp') as ImageSourcePropType,
  ghostduel: require('../../assets/cosmetics/features/ghostduel.webp') as ImageSourcePropType,
  war: require('../../assets/cosmetics/features/war.webp') as ImageSourcePropType,
  blink: require('../../assets/cosmetics/features/blink.webp') as ImageSourcePropType,
  seeker: require('../../assets/cosmetics/features/seeker.webp') as ImageSourcePropType,
};

/** The AI Coach mascot, the Ghost Duel opponent and the Season 1 trophy. */
export const CHAR_ART = {
  coach: require('../../assets/cosmetics/characters/coach.webp') as ImageSourcePropType,
  ghost: require('../../assets/cosmetics/characters/ghost.webp') as ImageSourcePropType,
  trophy: require('../../assets/cosmetics/characters/trophy.webp') as ImageSourcePropType,
};

export const UI_ICON = {
  questClockin: require('../../assets/cosmetics/ui/quest-clockin.webp') as ImageSourcePropType,
  questWin: require('../../assets/cosmetics/ui/quest-win.webp') as ImageSourcePropType,
  questDeploy: require('../../assets/cosmetics/ui/quest-deploy.webp') as ImageSourcePropType,
  lock: require('../../assets/cosmetics/ui/lock.webp') as ImageSourcePropType,
  star: require('../../assets/cosmetics/ui/star.webp') as ImageSourcePropType,
  crown: require('../../assets/cosmetics/ui/crown.webp') as ImageSourcePropType,
};
