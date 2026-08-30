---
workflow: general-video
flow: automation
storyboard: no
message: "Ten reasons to try Mempire, one per day, each one true and checkable"
destination: x-feed
aspect: 1080x1920
language: en
length: 18s
angle: gtm
---

## Intent

A ten-film slate for reach after the hackathon, one posted per day. Not ten
reskins of one idea: ten distinct hooks, ordered so the strongest and most
differentiated goes first.

The lead is **no custody**. Every crypto game asks a player to hand something
over; this one cannot, because no instruction exists that could. In a timeline
full of rugs that is the sharpest thing the product can say, and it had been
buried under feature talk in the devlogs.

## How it is built

One parameterized composition plus `slate.json`. Each row supplies a topic chip,
two headlines and four caption pairs; `build-all.mjs` renders one overlay per row
through `--variables-file --strict-variables`, then ffmpeg lays it over the
footage bed that row asked for and scores it. Adding an eleventh film is a row,
not a project.

`--strict-variables` is deliberate: a typo'd key would otherwise render silently
with the default copy, and ten films is exactly the scale where that ships
unnoticed.

## Assets

- `beds/battle.mp4` — 18s of a live practice match.
- `beds/tour.mp4` — 18s of the collection, shop and deck. Deliberately cut to
  avoid the card-detail sheet: it is a wall of body copy, and a headline over it
  makes both unreadable. That version was built and thrown away.
- `assets/music_battle.m4a`, `assets/music_menu.m4a` — the game's own tracks,
  battle for the arena films and menu for the collection ones, −9dB under copy.

## Notes

- Every claim traces to README.md or AUDIT.md as they stand today. The model
  changed after the hackathon and the old devlog copy is now wrong: there is no
  staking, holdings are never touched, levels come only from winning, and the
  roster is 36 verified assets. Nothing in this slate repeats the old line.
- Pipeline inherited from `videos/day-2-devlog`; its BRIEF explains why the
  composition never contains the footage.
