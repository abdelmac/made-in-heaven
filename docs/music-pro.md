# Adding music and ambient sound to Pro

Music playback is a proposed next feature, not part of the current release. The existing optional timer completion chime remains available to everyone.

Start with an owned or licensed library of ambient loops (rain, forest, cafe) and instrumental tracks. Put MP3 or AAC files in a **private** Supabase Storage bucket named `pro-audio`. Keep the catalog in a server-owned table with a stable track ID, title, artist/attribution, duration, category, and storage path. Do not accept arbitrary media URLs from the browser or expose the bucket publicly.

## Server access

1. Add a `music` feature to `PLAN_FEATURES` and the database `workspace_entitlements` function: false for Free, true for Pro and Team. Apply an additive migration; local plan values cannot grant access.
2. Create `/api/audio` as a Node route. Validate `workspaceId` and `trackId`, authenticate the user, call the existing workspace-membership and entitlement helpers, and enforce the existing durable rate limit. Look up the track in the allowlisted catalog.
3. Only after those checks, generate a signed Storage URL with a short lifetime (for example, 120 seconds). Respond with `Cache-Control: private, no-store`. Bucket policies must deny direct reads to both anonymous and authenticated clients, so an ordinary signed-in account cannot bypass the paid-access check. Keep service-role credentials on the server.
4. Recheck access when starting another track or renewing an expired link. On sign-out or workspace change, pause playback, clear the media source, and discard the old queue. A downgrade blocks future playback requests without deleting notes or other productivity data.

Supabase documents [private buckets and access control](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [signed downloads](https://supabase.com/docs/guides/storage/serving/downloads). Signed links can be used until they expire; they do not provide DRM or retract audio already downloaded by a browser. Keep premium audio out of Folia's service-worker caches.

## Player experience

Add one persistent `FocusAudioPlayer` to `FoliaApp`, so music survives navigation between Timer, Notes, and Flashcards. Native `<audio>` is sufficient for the first version; no player dependency is required.

- Offer Play/Pause, a volume slider, loop, track selection, and an optional “Pause during breaks” setting.
- Start playback only after a deliberate Play click and handle the promise from `audio.play()`. Show a retry action if autoplay restrictions block it. See [MDN's autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
- Save track ID, volume, and loop preference. Do not save signed URLs, and do not automatically resume sound after a reload.
- Keep a compact accessible player on mobile, alongside the existing active-timer control. Give every control an accessible name and support keyboard adjustment of volume.
- Stop or fade a track when the user ends it. A two-track crossfade or independent ambient mixer can follow later using Web Audio, after a Play gesture unlocks the audio context.

For a first release, keep audio online-only. Test Free/viewer/nonmember API access, expired URLs, downgrade/sign-out, failed playback, route navigation, volume persistence, and simultaneous timer completion. Document browser and locked-screen playback limitations.

## Hosted setup

For the current site, the route would live at `https://folia-ennearock.vercel.app/api/audio`. Configure Supabase first, apply the music entitlement/catalog migration, create the private bucket, upload permitted audio, and add catalog entries. Redeploy only after the server tests and real-browser player tests pass.

If you later add a streaming-service integration, follow that provider's own playback SDK, account requirements, and content rules. A URL from Spotify or another provider is not a direct MP3 source for `<audio>`.
