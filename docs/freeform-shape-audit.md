# Freeform shape target audit

November 4, 2026. All 14 active Freeform asset revisions passed all 210 version 3 geometry cases. All five controls are available on every audited model.

Each asset was checked at neutral, both endpoints of every slider in isolation, and four combined endpoint cases. Protected reference dimensions stayed within 1% of neutral. Edited references stayed within 5% of the requested scale. The audit measures the inner opening and outer rim. Side silhouettes and top cross-sections were reviewed.

Target positions are percentages of the original mesh height. Neck Width targets either a natural constriction or the upper wall below the rim. The Cylinder Pot uses 75–150% of baseline for Body Width and 85–115% for Neck Width. The other models retain the full ranges.

| Model | Asset revision | Height / foot | Body Width | Neck Width | Rim Size | Curvature bands |
| --- | --- | --- | --- | --- | --- | --- |
| Banded Terracotta Vase | `1790220252041_5e90bcba.glb` | 0.0%–100.0% / 3.7% | 46.2% | 82.5% (natural) | 97.5% | 3.7%–46.2%, 46.2%–64.4% |
| Bottle Teracotta Vase | `1790220280284_bd2255cc.glb` | 0.0%–100.0% / 3.8% | 37.5% | 82.5% (natural) | 95.3%–97.5% | 3.8%–37.5%, 37.5%–60.0% |
| Cylinder Pot | `original-e474b847-db24-4b11-bab9-d4aed0628abb-a2a2a8a0d47c8bd9.glb` | 0.0%–100.0% / 3.8% | 62.0% | 82.0% (upper wall) | 97.5% | 3.8%–62.0% |
| Cylinder Terracotta Vase | `original-c9827eb0-056e-43b1-a103-bbad47dc0121-3e7878462c1be155.glb` | 0.0%–100.0% / 3.8% | 51.2% | 79.0% (upper wall) | 97.5% | 3.8%–51.2%, 51.2%–65.1% |
| Mini Terracotta Bowl | `original-fb04add4-9a0a-4fec-8f86-7766cb28d758-b5c6cfe75d9b1f5d.glb` | 0.0%–100.0% / 3.8% | 78.8% | 90.0% (upper wall) | 97.5% | 3.8%–78.8% |
| Mini U-Shape Vase | `1790400086755_8d06f3b5.glb` | 0.0%–100.0% / 3.8% | 72.8% | 86.7% (upper wall) | 95.8%–97.5% | 3.8%–72.8% |
| Pedestal Base Jar | `original-eeb89cd2-85bb-4f8e-9605-935d7c25a800-1d42669d00ce6aa3.glb` | 0.0%–100.0% / 14.0% | 82.5% | 91.5% (upper wall) | 97.5% | 14.0%–82.5% |
| Plain U-Shape Planter | `original-a2a6b02a-da51-4197-b995-48ea7a817f6a-a042053174d33b4a.glb` | 0.0%–100.0% / 3.8% | 72.5% | 87.5% (upper wall) | 97.5% | 3.8%–72.5% |
| Rounded Garden Planter | `original-2b6b38ae-edaf-46d5-8aab-1025736c312c-72822adc7b169c13.glb` | 0.0%–100.0% / 3.7% | 70.0% | 86.5% (upper wall) | 97.5% | 3.7%–70.0% |
| Scalloped Rim Jar | `original-b773c487-dff9-49bf-b2cb-e923507f06f9-4b2a85253603a3c8.glb` | 0.0%–100.0% / 3.8% | 31.2% | 75.0% (natural) | 94.0% | 3.8%–31.2%, 31.2%–53.1% |
| Single Jarlet | `1790431315660_d443df7f.glb` | 0.0%–100.0% / 3.7% | 65.0% | 88.5% (natural) | 93.5%–94.0% | 3.7%–65.0% |
| Tall Cylinder Planter | `original-edf1aea8-193c-47e7-9ecc-4e4d711897ea-b541c761f7fd5db2.glb` | 0.0%–100.0% / 3.7% | 50.0% | 78.5% (upper wall) | 97.5% | 3.7%–50.0%, 50.0%–64.2% |
| Tall Garden Planter | `original-dc648193-1eed-4507-a628-d5517c309ec4-582d2969343a79f5.glb` | 0.0%–100.0% / 3.7% | 57.5% | 81.5% (upper wall) | 97.5% | 3.7%–57.5% |
| Terracotta Cylinder Planter | `original-c89a2dc2-736b-4a0c-9bae-01a39c2eafe4-870fe1d089de0b8e.glb` | 0.0%–100.0% / 3.7% | 82.5% | 91.5% (upper wall) | 97.5% | 3.7%–82.5% |

## Reproduce and approve a model revision

Export the active rows from `models_3d` to `catalog.json`, including model ID, name, asset URL, base dimensions, price, and production days. Download each exact asset revision into the same directory as `<id>.glb`. From `gallery-app`, run:

```text
node scripts/audit-freeform-shapes.mjs <asset-directory> <report-directory>
```

The runner writes per-case results, measurements for failures, and projection data for the side and mouth views. It fails for missing assets, unavailable controls, invalid profiles, or out-of-tolerance results.

After the measurements and visual review pass, record the exact model ID and asset URL in `gallery-app/src/components/freeform/auditedShapeAssets.json`. Ship that manifest update to make a new or replaced asset selectable in Freeform. Use a new immutable asset URL for a replacement. Existing saved designs and submitted requests continue to use the asset and profile saved with them.
