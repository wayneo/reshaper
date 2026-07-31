# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added
- Full bilingual support (English / Traditional Chinese): a language toggle in the header, every UI string translated, and every style's title/prompt plus every category's name translated. Generation requests in Chinese mode send the Chinese prompt straight to Gemini/OpenAI.
- **Product** category with 9 new styles (Cinematic Product Poster, Puffy Inflated Poster, Acrylic Showcase Card, Splash Explosion, Black Gloss Podium, Neon Night Reflection, Seasonal Flat Lay, Billboard Campaign, Unboxing Reveal) — the first styles built around a product/object rather than a person, each deriving its own title and tagline copy from whatever's actually in the uploaded photo.
- 16 more styles across the existing categories (Layered Papercut Diorama, Mini 3D Doll Scrapbook, Dopamine Illustration, Chibi Travel Poster, Pen Sketch Notebook, Rounded Chibi Sticker, Fridge Magnet Icon, Architectural Blueprint Poster, Miniature Postage Stamp, Funko Pop Figure, Google Maps Pin Character, Vaporwave, Claymation Film Still, Cross-Stitch Pattern, Coin Relief Medallion, Tarot Card Portrait).
- Newly created styles now default to the top of the picker instead of the bottom.

## 0.1.0 — Initial public release

### Added
- Core app: upload a photo, pick a style, generate with your own Gemini or OpenAI API key (bring-your-own-key, no shared key, no server-side storage).
- Style library with categories, admin panel (`/admin`) for managing both without touching code.
- Before/after comparison slider and an opt-in "Customize prompt" panel.
- MIT license, public GitHub repo, README with feature overview and screenshot.
