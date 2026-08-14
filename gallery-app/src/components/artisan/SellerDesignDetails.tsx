import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import {
  Box, ClipboardList, LoaderCircle, MousePointer2, Palette, Puzzle, RotateCcw, Ruler,
} from 'lucide-react';
import { getPattern, getPatternCategory, PATTERN_CATEGORIES } from '../freeform/decor';
import { getFinishDefinition } from '../freeform/materials';
import type { AttachmentPlacementTransform } from '../freeform/attachments';
import type { DesignRequestSnapshotV1 } from '../../types/designRequest';

const FreeformViewer = lazy(() => import('../freeform/FreeformViewer'));
const ignoreMorphDetection = () => {};

type ViewerControls = { reset?: () => void; update?: () => void };

export interface SellerDesignDetailsProps {
  snapshot: DesignRequestSnapshotV1;
  requestId: string;
  buyerName: string;
  revision: number;
  quantity: number;
  buyerNote: string;
  createdAt: string;
  updatedAt: string;
  children?: ReactNode;
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCentimeters(value: unknown) {
  return `${finiteNumber(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} cm`;
}

function formatPercent(value: unknown) {
  return `${Math.round(finiteNumber(value) * 100)}%`;
}

function formatDegrees(value: unknown) {
  return `${Math.round(finiteNumber(value))}°`;
}

function formatMoney(value: unknown) {
  return `₱${finiteNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function safeColor(value: unknown, fallback = '#BE734F') {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function placementRows(transform: AttachmentPlacementTransform, modelHeightCm: number) {
  return [
    ['Horizontal position', formatDegrees(transform.horizontalDegrees)],
    ['Vertical position', formatCentimeters(finiteNumber(transform.verticalRatio) * modelHeightCm)],
    ['Surface offset', formatCentimeters(finiteNumber(transform.surfaceOffsetRatio) * modelHeightCm)],
    ['Rotation', formatDegrees(transform.twistDegrees)],
    ['Scale', formatPercent(transform.scaleMultiplier)],
    ['Thickness', formatPercent(transform.thicknessMultiplier)],
  ];
}

export default function SellerDesignDetails({
  snapshot, requestId, buyerName, revision, quantity, buyerNote, createdAt, updatedAt, children,
}: SellerDesignDetailsProps) {
  const [viewerControls, setViewerControls] = useState<ViewerControls | null>(null);
  const pattern = getPattern(snapshot.decoration.patternId);
  const patternCategoryId = getPatternCategory(snapshot.decoration.patternId);
  const patternCategory = PATTERN_CATEGORIES.find((category) => category.id === patternCategoryId)?.label;
  const finish = getFinishDefinition(snapshot.material.finish);
  const materialColor = safeColor(snapshot.material.color, finish.color);
  const patternColor = safeColor(snapshot.decoration.color, '#7A3E12');
  const heightCm = finiteNumber(snapshot.dimensions.heightCm || snapshot.shape.height);

  const handleControlsReady = useCallback((controls: ViewerControls | null) => {
    setViewerControls(controls);
  }, []);

  function resetView() {
    viewerControls?.reset?.();
    viewerControls?.update?.();
  }

  return <div className="seller-design-workspace__layout">
    <section className="seller-design-workspace__viewer-pane" aria-labelledby="seller-design-model-heading">
      <div className="seller-design-workspace__viewer-heading">
        <div><span>Interactive model</span><h3 id="seller-design-model-heading">{snapshot.model.name || 'Custom pottery design'}</h3></div>
        <button type="button" onClick={resetView} disabled={!viewerControls} aria-label="Reset 3D view"><RotateCcw /> Reset view</button>
      </div>
      <div className="seller-design-workspace__viewer" aria-label="Interactive 3D design">
        <Suspense fallback={<div className="seller-request-viewer__loading"><LoaderCircle className="seller-spin" /> Loading 3D preview…</div>}>
          <FreeformViewer
            modelFile={snapshot.model.file}
            shapeParams={snapshot.shape}
            materialParams={snapshot.material}
            decorationParams={snapshot.decoration}
            attachmentParams={snapshot.attachments}
            showAttachmentSockets={false}
            pauseAttachmentAnalysis
            onMorphDetected={ignoreMorphDetection}
            onControlsReady={handleControlsReady}
          />
        </Suspense>
      </div>
      <div className="seller-design-workspace__viewer-help"><MousePointer2 /><span>Drag to rotate · Scroll or pinch to zoom</span></div>
    </section>

    <div className="seller-design-workspace__details">
      <section className="seller-design-detail-card seller-design-detail-card--overview">
        <div className="seller-design-detail-card__title"><ClipboardList /><div><span>Request overview</span><h3>Current submission</h3></div><b>Revision {revision}</b></div>
        <dl className="seller-design-facts">
          <div><dt>Request ID</dt><dd>#{requestId.slice(0, 8).toUpperCase()}</dd></div>
          <div><dt>Buyer</dt><dd>{buyerName}</dd></div>
          <div><dt>Quantity</dt><dd>{quantity}</dd></div>
          <div><dt>Submitted</dt><dd>{formatDate(createdAt)}</dd></div>
          <div><dt>Last updated</dt><dd>{formatDate(updatedAt)}</dd></div>
        </dl>
      </section>

      <section className="seller-design-detail-card">
        <div className="seller-design-detail-card__title"><Box /><div><span>Base model</span><h3>Model information</h3></div></div>
        <dl className="seller-design-facts">
          <div><dt>Name</dt><dd>{snapshot.model.name || 'Custom pottery design'}</dd></div>
          <div><dt>Category</dt><dd>{snapshot.model.category || 'Custom design'}</dd></div>
          <div><dt>Model ID</dt><dd>{snapshot.model.id || 'Not available'}</dd></div>
        </dl>
      </section>

      <section className="seller-design-detail-card">
        <div className="seller-design-detail-card__title"><Ruler /><div><span>Measurements</span><h3>Dimensions and shape</h3></div></div>
        <dl className="seller-design-facts seller-design-facts--metrics">
          <div><dt>Height</dt><dd>{formatCentimeters(snapshot.dimensions.heightCm || snapshot.shape.height)}</dd></div>
          <div><dt>Body width</dt><dd>{formatCentimeters(snapshot.dimensions.widthCm || snapshot.shape.bodyWidth)}</dd></div>
          <div><dt>Neck width</dt><dd>{formatCentimeters(snapshot.shape.neckWidth)}</dd></div>
          <div><dt>Rim diameter</dt><dd>{formatCentimeters(snapshot.shape.rimSize)}</dd></div>
          <div><dt>Curvature</dt><dd>{`${Math.round(finiteNumber(snapshot.shape.curvature))}%`}</dd></div>
        </dl>
      </section>

      <section className="seller-design-detail-card">
        <div className="seller-design-detail-card__title"><Palette /><div><span>Surface</span><h3>Material and decoration</h3></div></div>
        <div className="seller-design-surface-grid">
          <div className="seller-design-surface-block"><h4>Material</h4><dl className="seller-design-facts"><div><dt>Finish</dt><dd>{finish.label}</dd></div><div><dt>Base color</dt><dd><i className="seller-design-color" style={{ background: materialColor }} />{materialColor}</dd></div></dl></div>
          <div className="seller-design-surface-block"><h4>Pattern</h4>{pattern ? <dl className="seller-design-facts"><div><dt>Motif</dt><dd>{pattern.name}</dd></div><div><dt>Category</dt><dd>{patternCategory || 'Other'}</dd></div><div><dt>Description</dt><dd>{pattern.description}</dd></div><div><dt>Placement</dt><dd>{snapshot.decoration.placement === 'full' ? 'Full wrap' : snapshot.decoration.placement}</dd></div><div><dt>Effect</dt><dd>{snapshot.decoration.effect}</dd></div><div><dt>Scale</dt><dd>{formatPercent(snapshot.decoration.scale)}</dd></div><div><dt>Color</dt><dd><i className="seller-design-color" style={{ background: patternColor }} />{patternColor}</dd></div></dl> : <p className="seller-design-empty-value">No pattern selected.</p>}</div>
        </div>
      </section>

      <section className="seller-design-detail-card">
        <div className="seller-design-detail-card__title"><Puzzle /><div><span>Added components</span><h3>Attachments</h3></div><b>{snapshot.attachments.reduce((total, item) => total + item.placements.length, 0)} total</b></div>
        {snapshot.attachments.length ? <div className="seller-design-attachments">{snapshot.attachments.map((attachment) => {
          const addedPrice = finiteNumber(attachment.priceAdjustment) * attachment.placements.length;
          return <article key={attachment.id} className="seller-design-attachment">
            <header><div><h4>{attachment.name}</h4><p>{attachment.family} · {attachment.placements.length} placement{attachment.placements.length === 1 ? '' : 's'}</p></div><span>{formatMoney(addedPrice)} · +{finiteNumber(attachment.productionDaysAdjustment)} days</span></header>
            <div>{attachment.placements.map((placement, index) => <details key={`${attachment.id}-${placement.socket.id}`}>
              <summary><span>{placement.socket.name || `Placement ${index + 1}`}</span><small>Socket {Math.round(finiteNumber(placement.socket.height) * 100)}% high · {formatDegrees(placement.socket.azimuth)}</small></summary>
              <dl>{placementRows(placement.transform, heightCm).filter(([label]) => attachment.family === 'handle' || label !== 'Thickness').map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </details>)}</div>
          </article>;
        })}</div> : <p className="seller-design-empty-value">No attachments were added to this design.</p>}
      </section>

      <section className="seller-design-detail-card seller-design-detail-card--estimate">
        <div><span>Buyer estimate</span><strong>{formatMoney(snapshot.estimate.price)}</strong></div><div><span>Estimated production</span><strong>{finiteNumber(snapshot.estimate.productionDays)} days</strong></div>
        <div className="seller-design-buyer-note"><span>Buyer note</span><p>{buyerNote || 'No additional note.'}</p></div>
      </section>

      {children}
    </div>
  </div>;
}
