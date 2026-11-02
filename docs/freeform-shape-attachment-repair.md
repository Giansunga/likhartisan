# Freeform shape and attachment repair

Verified locally on November 3, 2026. This change preserves the existing designer steps, controls, saved-design formats, and request snapshot format.

## Behavior

- Shape edits use immutable source snapshots through shared geometry helpers. Reset restores source positions and normals exactly.
- Dimensional ranges stay at 50–150% of the baseline; saved outliers extend the initial range without moving its endpoints during editing. Saved baseline metadata takes precedence over later catalog edits.
- Shape and attachment sliders commit their final value on release outside the input, cancellation, blur, keyboard release, and panel unmount. Pending changes survive delayed parent updates.
- Attachment keyboard controls use their declared increments, including horizontal position, scale, and depth.
- Validation runs independently of the Attachment tab. Results include the design revision, sockets, accepted transforms, limits, and incompatibility reasons.
- Unsafe edits to an existing valid selection keep its preceding safe transform. Linked proposals are accepted or rejected together. Replacing one socket preserves the other side of a pair.
- Incompatible attachments remain in state with an explanation. They block save/send; missing mounts do not leave stale meshes visible. Catalog errors retain selections and support retry.
- Read-only request previews use the same accepted transforms as the editor, including safe fallbacks for old saved offsets.
- Thickness affects handle seating and safety checks. Depth readouts use the actual model scale, including wide models.

## Automated verification

Run from `gallery-app`:

```powershell
npm run test -- src --maxWorkers=4
npm run build
npm run lint
npx vitest run scripts/verify-freeform.test.ts
```

- Frontend suite: **142 files, 835 tests passed**.
- Production build: passed. Existing large-chunk/config-loader warnings remain.
- Changed-file lint: zero errors; two existing warnings in the clean-design capture effect remain.
- Repository-wide lint: 53 errors and five warnings, in existing code and output fixtures. Logs are in `gallery-app/output/freeform-repair/`.
- The optional catalog verifier uses cached GLBs in `output/pattern-check/`; it skips when that local catalog is absent and never downloads or rewrites model files.
- Catalog matrix: seven representative meshes, 12 shape cases per mesh, eight recipes per case. Covered narrow-neck, bowl, cylindrical, rounded, square, irregular, and the largest cached model. Unsupported placements were explicitly classified; reset restored geometry byte-for-byte.
- Single-placement validation p95: Wave Pot **3.82 ms**; largest cached model (Banded Terracotta Vase, 20.6 MB) **3.50 ms**. These are CPU validation measurements, not end-to-end frame times.

## Reproducible browser checklist

1. Start the local app. Choose a shop and pottery model. On Shape, use Home/End and arrows for all five sliders. Reset between checks and verify zero offsets and the original silhouette.
2. Drag a slider and release outside its bounds. Change steps during an edit. Return and verify the final value remains committed.
3. Add paired Bamboo Loop handles. Change horizontal position, vertical position, depth, rotation, scale, and thickness. Switch between Linked, Left, and Right; reset an individual side and then the linked pair.
4. Replace one side with a different handle. Confirm its partner remains and totals count the physical placements.
5. Return to Shape, edit it, and advance to Review. Valid handles remain seated. Incompatible selections remain listed, with save/send blocked until adjusted or removed.
6. At 393 × 852, drag both a shape slider and attachment thickness with touch. Confirm there is no horizontal overflow and the controls remain reachable.
7. Simulate catalog failure and retry. Confirm selections survive. Regression tests also cover empty sockets, unavailable recipes, stale analysis, collisions, and errors on Review without opening Attachment.
8. Open the local read-only preview harness at `/output/freeform-repair/index.html`. Its saved rotation starts at 160° with an unsafe offset; analysis must return a seated fallback. The analysis counter must stay stable while idle and increment after “Nudge shape.”

Desktop/mobile screenshots, the read-only preview, catalog timings, and verification logs are under `gallery-app/output/freeform-repair/`. Browser controls were checked with cached GLBs because the local image gateway was unavailable. Save/request persistence was verified through serialization and mocked workflow tests; no production records were created.

Deployment, model reuploads, new recipes, database migrations, and unused legacy preview/export features are outside this change.
