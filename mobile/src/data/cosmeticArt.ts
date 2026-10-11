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

/** Game UI art: full-bleed screen backgrounds, item icons and the tab bar. */
export const GAME_BG = {
  home: require('../../assets/game/bg/home.webp') as ImageSourcePropType,
  duels: require('../../assets/game/bg/duels.webp') as ImageSourcePropType,
  shop: require('../../assets/game/bg/shop.webp') as ImageSourcePropType,
};
export const ITEM_ART = {
  coin: require('../../assets/game/items/coin.webp') as ImageSourcePropType,
  gem: require('../../assets/game/items/gem.webp') as ImageSourcePropType,
  energy: require('../../assets/game/items/energy.webp') as ImageSourcePropType,
  ticket: require('../../assets/game/items/ticket.webp') as ImageSourcePropType,
  chestClosed: require('../../assets/game/items/chest-closed.webp') as ImageSourcePropType,
  chestOpen: require('../../assets/game/items/chest-open.webp') as ImageSourcePropType,
  streak: require('../../assets/game/items/streak.webp') as ImageSourcePropType,
  vs: require('../../assets/game/items/vs.webp') as ImageSourcePropType,
};
export const NAV_ART = {
  home: require('../../assets/game/nav/home.webp') as ImageSourcePropType,
  battle: require('../../assets/game/nav/battle.webp') as ImageSourcePropType,
  deck: require('../../assets/game/nav/deck.webp') as ImageSourcePropType,
  duels: require('../../assets/game/nav/duels.webp') as ImageSourcePropType,
  shop: require('../../assets/game/nav/shop.webp') as ImageSourcePropType,
  pass: require('../../assets/game/nav/pass.webp') as ImageSourcePropType,
};

/** The Emperor mascot, and the premium UI pieces (ribbon, stamp, play emblem, season crown). */
export const MASCOT = {
  wave: require('../../assets/game/mascot/wave.webp') as ImageSourcePropType,
  cheer: require('../../assets/game/mascot/cheer.webp') as ImageSourcePropType,
  sleep: require('../../assets/game/mascot/sleep.webp') as ImageSourcePropType,
};
export const PREMIUM_UI = {
  ribbon: require('../../assets/game/gameui/ribbon.webp') as ImageSourcePropType,
  stamp: require('../../assets/game/gameui/stamp.webp') as ImageSourcePropType,
  play: require('../../assets/game/gameui/play.webp') as ImageSourcePropType,
  seasonCrown: require('../../assets/game/gameui/season-crown.webp') as ImageSourcePropType,
};
