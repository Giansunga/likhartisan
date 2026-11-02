import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FreeformViewer from '../../src/components/freeform/FreeformViewer';
import type { AttachmentAnalysis } from '../../src/components/freeform/attachmentValidation';
import { shapeFromModelBase } from '../../src/lib/measurements';
import type { AttachmentSelection } from '../../src/components/freeform/attachments';

const initial = shapeFromModelBase({ height: 14, bodyWidth: 5, neckWidth: 5, rimSize: 5 });
const attachments: AttachmentSelection[] = [{ version: 4, id: 'legacy-left', recipeKey: 'bamboo-loop', recipeVersion: 1,
  family: 'handle', name: 'Bamboo Loop', shopId: null, priceAdjustment: 0, productionDaysAdjustment: 0,
  placements: [{ socket: { id: 'auto-handle-left', name: 'Left', family: 'handle', height: .5, azimuth: -90, pairGroup: null },
    transform: { horizontalDegrees: 0, verticalRatio: -.035, surfaceOffsetRatio: .04, twistDegrees: 160, scaleMultiplier: 1, thicknessMultiplier: 1 } }] }];
export default function Verification() {
  const [shape, setShape] = useState(initial);
  const [observed, setObserved] = useState<{ count: number; analysis: AttachmentAnalysis | null }>({ count: 0, analysis: null });
  return <main style={{ fontFamily: 'sans-serif' }}><h1>Read-only saved attachment preview</h1>
    <button onClick={() => setShape(value => ({ ...value, height: value.height + .1 }))}>Nudge shape</button>
    <output aria-label="Analysis passes">{observed.count}</output>
    <pre aria-label="Analysis result">{JSON.stringify(observed.analysis)}</pre>
    <div style={{ width: 800, height: 650 }}><FreeformViewer
      modelFile="/output/pattern-check/ac003cd7-178d-423c-8672-3a4ca742b23d.glb"
      shapeParams={shape} materialParams={{ finish: 'raw_clay', color: '#BE734F' }} attachmentParams={attachments}
      onMorphDetected={() => {}} onAttachmentAnalysis={analysis => setObserved(value => ({ count: value.count + 1, analysis }))}
      preview showAttachmentSockets={false} /></div></main>;
}
createRoot(document.getElementById('root')!).render(<Verification />);
