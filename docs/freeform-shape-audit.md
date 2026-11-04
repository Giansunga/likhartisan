# Freeform shape target audit

November 4, 2026. All 14 active catalog assets loaded and qualified for the picker. All 190 geometry cases passed.

Each row covers neutral, the individual minimum and maximum for every applicable slider, and four combined endpoint cases. Protected dimensions stayed within 1% of neutral. Edited targets stayed within 5% of the requested scale. The measurements include the inner opening and outer rim. Side silhouettes and top cross-sections were reviewed for the tested cases.

Percentages are positions relative to the original mesh height. The height column lists the vertical span and the top of the protected foot. The curvature column lists the wall bands. A dash in Neck Width indicates a model with no distinct neck and a disabled slider. All enabled controls retain their full ranges.

| Model | Asset revision | Height / foot | Body Width | Neck Width | Rim Size | Curvature |
| --- | --- | --- | --- | --- | --- | --- |
| Banded Terracotta Vase | `1790220252041_5e90bcba.glb` | 0.0%–100.0% / 3.7% | 46.2% | 82.5% | 97.5% | 3.7%–46.2%, 46.2%–64.4% |
| Bottle Teracotta Vase | `1790220280284_bd2255cc.glb` | 0.0%–100.0% / 3.8% | 37.5% | 82.5% | 95.3%–97.5% | 3.8%–37.5%, 37.5%–60.0% |
| Cylinder Pot | `original-e474b847-db24-4b11-bab9-d4aed0628abb-a2a2a8a0d47c8bd9.glb` | 0.0%–100.0% / 3.8% | 81.2% | — | 97.5% | 3.8%–81.2% |
| Cylinder Terracotta Vase | `original-c9827eb0-056e-43b1-a103-bbad47dc0121-3e7878462c1be155.glb` | 0.0%–100.0% / 3.8% | 51.2% | — | 97.5% | 3.8%–51.2% |
| Mini Terracotta Bowl | `original-fb04add4-9a0a-4fec-8f86-7766cb28d758-b5c6cfe75d9b1f5d.glb` | 0.0%–100.0% / 3.8% | 80.0% | — | 97.5% | 3.8%–80.0% |
| Mini U-Shape Vase | `1790400086755_8d06f3b5.glb` | 0.0%–100.0% / 3.8% | 81.2% | — | 97.5% | 3.8%–81.2% |
| Pedestal Base Jar | `original-eeb89cd2-85bb-4f8e-9605-935d7c25a800-1d42669d00ce6aa3.glb` | 0.0%–100.0% / 14.0% | 83.8% | — | 97.5% | 14.0%–83.8% |
| Plain U-Shape Planter | `original-a2a6b02a-da51-4197-b995-48ea7a817f6a-a042053174d33b4a.glb` | 0.0%–100.0% / 3.8% | 73.8% | — | 97.5% | 3.8%–73.8% |
| Rounded Garden Planter | `original-2b6b38ae-edaf-46d5-8aab-1025736c312c-72822adc7b169c13.glb` | 0.0%–100.0% / 3.7% | 71.2% | — | 97.5% | 3.7%–71.2% |
| Scalloped Rim Jar | `original-b773c487-dff9-49bf-b2cb-e923507f06f9-4b2a85253603a3c8.glb` | 0.0%–100.0% / 3.8% | 31.2% | 75.0% | 94.0% | 3.8%–31.2%, 31.2%–53.1% |
| Single Jarlet | `1790431315660_d443df7f.glb` | 0.0%–100.0% / 3.7% | 65.0% | 88.8% | 93.5%–94.0% | 3.7%–65.0% |
| Tall Cylinder Planter | `original-edf1aea8-193c-47e7-9ecc-4e4d711897ea-b541c761f7fd5db2.glb` | 0.0%–100.0% / 3.7% | 51.2% | — | 97.5% | 3.7%–51.2% |
| Tall Garden Planter | `original-dc648193-1eed-4507-a628-d5517c309ec4-582d2969343a79f5.glb` | 0.0%–100.0% / 3.7% | 57.5% | — | 97.5% | 3.7%–57.5% |
| Terracotta Cylinder Planter | `original-c89a2dc2-736b-4a0c-9bae-01a39c2eafe4-870fe1d089de0b8e.glb` | 0.0%–100.0% / 3.7% | 85.0% | — | 97.5% | 3.7%–85.0% |

## Reproduce the audit

Export the active rows from `models_3d` to `catalog.json`, including the model ID, name, asset URL, base dimensions, price, and production days. Download each exact asset revision into the same directory as `<id>.glb`. From `gallery-app`, run:

```text
node scripts/audit-freeform-shapes.mjs <asset-directory> <report-directory>
```

The runner writes per-case results, measurements for any failures, and projection data for the side and mouth views. It exits with an error for missing assets, invalid saved profiles, or out-of-tolerance results.
