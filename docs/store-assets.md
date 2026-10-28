# Store graphics

Prepared on 28 October 2026 from the original Solace mark and ink/ivory colors in
`src/lib/brand.ts`. The French caption is “Un temps pour se concentrer.” No device
screenshots are included; capture the release app during real device QA.

Run `node scripts/prepare-store-assets.mjs` from the repository to reproduce the
exports without changing native assets or installing dependencies. It uses Sharp
and the app’s existing Manrope font. PNG dimensions, channels, color profile,
opacity, file sizes and SHA-256 hashes are verified in `assets.json`.

| Asset                              | Local export                                                      | Format                                      |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Google Play icon                   | `.local/exports/store-assets/google-play-icon-512.png`            | 512 × 512, RGBA PNG, sRGB, full square      |
| Google Play French feature graphic | `.local/exports/store-assets/google-play-feature-fr-1024x500.png` | 1024 × 500, RGB PNG, sRGB, no alpha         |
| Apple primary App Store icon       | `.local/exports/store-assets/app-store-icon-1024.png`             | 1024 × 1024, RGB PNG, sRGB, no alpha        |
| Verification record                | `.local/exports/store-assets/assets.json`                         | File hashes, dimensions and French alt text |

The Play export keeps the existing full-square icon’s geometry and avoids the
rounded corners in the web icon. Google requires a 512 × 512, 32-bit PNG up to
1024 KB and applies its own masking and shadow. Its feature graphic must be
1024 × 500, JPEG or 24-bit PNG without alpha. The caption and mark stay away from
the edges. See [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
and [Google Play icon specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

The Apple export uses the existing generated 1024 × 1024 native icon, with exactly
the same decoded RGB pixels. Its redundant alpha channel was also removed from
the source primary icon; the native asset generator now omits alpha from opaque
artwork while preserving artwork that uses transparency. This source correction
does not change the signed Android artifacts. Apple supports a single 1024 × 1024
primary image in the asset catalog and applies the platform’s mask. See
[Apple’s asset catalog instructions](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)
and [app icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons/).

Suggested French feature graphic alt text: “Logo Solace et texte « Un temps pour
se concentrer. » sur fond ivoire.”

Review the exported artwork before entering it in the store consoles. No assets
have been uploaded, and these marketing graphics do not replace required app
screenshots or platform archive validation.
