# Fonts

All fonts are self-hosted subsets, licensed under the **SIL Open Font License 1.1** (full texts alongside).
Subsets are regenerated with `python3 tools/build_fonts.py`. None of the three families declares a Reserved Font Name;
the CSS family names ("Ledger Serif", "Ledger Serif SC", "Ledger Sans") are just aliases. The OFL permits subsetting,
bundling and redistribution with the app (including the Android APK) as long as the license texts travel with the fonts.

| File | Source | Use | License |
|---|---|---|---|
| `ledger-serif-sc-ui.woff2`, `ledger-serif-sc-01…13.woff2` (+ `serif-sc.css`) | Noto Serif SC (Source Han Serif) — Google / Adobe, variable wght 400–600. Split by `unicode-range`: a critical chunk with the glyphs used in UI headlines (~40 KB, preloaded) plus 13 on-demand chunks covering GB2312 level 1 ∪ the 3,500 most frequent hanzi | Chinese headlines | OFL 1.1 (`OFL-NotoSerifSC.txt`) |
| `ledger-serif.woff2` | Newsreader — Production Type, opsz 28, wght 400–600, Latin subset | Wordmark, English headlines, display numerals | OFL 1.1 (`OFL-Newsreader.txt`) |
| `ledger-serif-italic.woff2` | Newsreader Italic — opsz 16, wght 400, Latin subset | Eyebrow / English motto | OFL 1.1 (`OFL-Newsreader.txt`) |
| `ledger-sans.woff2` | Inter — Rasmus Andersson, opsz 14, wght 300–600, Latin subset | Body & UI text (Latin); Chinese body text uses the system sans | OFL 1.1 (`OFL-Inter.txt`) |

## Pixel themes (v10)

Built by `python3 tools/build_px_fonts.py`, which also writes the `@font-face` block in `pixel.css` and `fonts/px-sc.css`.

| File | Source | Use | License |
|---|---|---|---|
| `px-sc-ui.woff2`, `px-sc-01…09.woff2` (+ `px-sc.css`) | Fusion Pixel Font 12px proportional (zh_hans), TakWolf. Split by `unicode-range`: a critical chunk with every hanzi used in the UI (~20 KB, preloaded on pixel skins) plus 9 on-demand chunks covering GB2312 level 1 ∪ the 3,500 most frequent hanzi, so typed Chinese also renders in pixels | Chinese text in Farm / Arcade / Night | OFL 1.1 (`OFL-FusionPixel.txt`) |
| `px-latin.woff2` | Pixelify Sans, Stefie Justprince, Latin subset | English UI, numerals in pixel skins | OFL 1.1 (`OFL-PixelifySans.txt`) |
| `px-arcade.woff2` | Press Start 2P, CodeMan38, A–Z/0–9 subset | Arcade HUD and score labels | OFL 1.1 (`OFL-PressStart2P.txt`) |
| `px-sym.woff2` | Fusion Pixel Font, arrows/stars/moon symbols | Small pixel symbols | OFL 1.1 (`OFL-FusionPixel.txt`) |

Characters outside these subsets fall back to the system font.

Press Start 2P declares the Reserved Font Name "Press Start 2P". Because a subset counts as a Modified Version under the OFL,
`px-arcade.woff2` is renamed internally to "Arcade8" (name IDs 1/3/4/6), and the CSS family name is also "Arcade8".
Fusion Pixel Font and Pixelify Sans declare no Reserved Font Name.
