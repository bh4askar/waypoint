# Destination and landmark photographs

Landmark cards show photographs matched to that named place. A destination cover is never substituted for an unavailable landmark photo. Multiple matched images appear as selectable thumbnails, with the original source and licence shown for the selected photograph. Destination covers have their own gallery.

The offline import pipeline processes the complete 1,100-destination catalogue and all included guide landmark records. It resolves Wikipedia article titles/coordinates, exact GeoNames-to-Wikidata identities for destinations, and original Commons file descriptions for extra views or missing subjects. It rejects disambiguation pages, distant coordinates, maps, flags, logos, unknown licences and duplicate image files. Images are converted to JPEG and sized for the app.

These are automated source matches, not a claim of a manual visual review of every image. Some guide names are generic or lack coordinates, and some places have no suitable reusable image in the searched sources. Missing matches stay explicitly unavailable. The full attempt/coverage record is `public/assets/photo-coverage.json`.

## Refresh the catalogue

With Node.js, Python and Pillow installed:

```sh
node scripts/photo-targets.mjs
python scripts/sync-exact-photos.py --search-missing
```

Network responses are cached under ignored `data/photo-audit/`, allowing interrupted imports to resume. Requests are spaced and back off on rate limits. New photo metadata is written to `lib/destination-photos.json`, `lib/place-photos.json` and matching public credit files. Keep original sources, authors, licences and licence links with every redistributed photo.

Landmark records use destination IDs plus the place name to avoid collisions between identically named cities. Nearby-guide stops retain their source-city association. Previously saved trips refresh photos from `/api/photos` when opened. The model does not select or generate photographs.

## Current included coverage

1,100/1,100 destination records have local source-attributed JPEG files; 700 have multiple views. 997/3,679 included guide entries have matched original photographs; 306 have multiple views. A file check is not a full manual verification of every scene. The report distinguishes source matches and unmatched entries instead of counting city-photo substitutions.

Original publisher/venue images use `lib/external-photo-sources.json` and `lib/source-photo-files.json`. To download and validate reviewed references, run `python scripts/cache-original-photos.py`. Small icons, transparent placeholders, oversized images and unreadable image responses are rejected. `node scripts/audit-photo-coverage.mjs` verifies included JPEGs, refreshes public credits and requires destination coverage to remain 1,100. Reviewed incorrect photos are listed in `lib/photo-rejections.json` and cannot be restored from saved-trip caches.

JPEG assets are resized and compressed for the free hosting storage limit. Resizing does not generate or replace scene content. Source photographs and derived night/sunset hero backgrounds are separate.
