# Playground

The real overlay pages in a browser, over game screenshots, with buttons that play what the game
would do. No game, no Electron, no engine.

    npm run playground      # http://localhost:5199

- **Background:** the screenshots in `playground/backgrounds/` (kept out of git: they show other
  players' names), plus any image you pick with "Add…", drop on the page or paste.
- **Simulate the game:** hit a monster or a player, select one, enemies, field boss, cube, death, Kina,
  Abyss Points, a guild event. They feed the real page through a stand-in for the app's bridge
  (`stub.ts`), so what you see is `UnifiedPage.vue` itself, not a copy.
- **Look:** placement (centre, left or right of the game's target frame), flush to the top, target
  style, opacity, size, and the optional figures.

Placement is only a prototype here (the app has no such setting yet). The Claude Design prototype
("Lokthar Unified HUD") carries the same buttons: when you add or change a simulation here, change it
there too, and the other way round.

Not simulated: the Spacetime Rift farm and the next-event icons (they follow the real clock), and the
window behaviour of the real overlay (click-through, resizing).
