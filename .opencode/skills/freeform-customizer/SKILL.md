---
name: freeform-customizer
description: Freeform pottery customizer 3D viewer and design system
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: threejs
---

## What I do
- Guide freeform pottery customizer development
- Handle 3D model loading with Three.js/R3F
- Manage shape deformation and material system
- Implement design save/load with Supabase

## When to use me
Use this when modifying the freeform customizer components.

## Tech stack
- React Three Fiber (@react-three/fiber)
- Drei helpers (@react-three/drei)
- GLTFLoader for 3D models
- Supabase Storage for thumbnails

## Component structure
```
FreeformPage.tsx      - Main layout with stepper
├── FreeformViewer.tsx - 3D canvas with model
├── ModelTab.tsx      - Model selection (from Supabase)
├── ShapeTab.tsx      - Shape parameters (height, width, etc.)
├── MaterialTab.tsx   - Color and finish selection
└── SaveTab.tsx       - Save/load designs
```

## 3D viewer patterns
```tsx
// Model loading with texture clearing
useEffect(() => {
  if (gltf) {
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.map = null; // Clear GLB texture
        child.material.color.set(materialColor);
      }
    });
  }
}, [gltf, materialColor]);

// Studio lighting
<ambientLight intensity={0.4} />
<directionalLight position={[5, 5, 5]} intensity={0.8} />
<directionalLight position={[-3, 3, -3]} intensity={0.3} />
<ContactShadows scale={10} blur={3} opacity={0.5} />
```

## Shape deformation
- Use morph targets if available
- Fallback to vertex displacement
- Parameters in cm (height, bodyWidth, neckWidth, rimSize, curvature)

## Material system
- 5 finishes: Raw Clay, Matte, Ceramic, Glazed, Metallic
- Preset roughness/metalness per finish
- Color picker with hex input
