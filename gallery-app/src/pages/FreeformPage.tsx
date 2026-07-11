import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import FreeformViewer from '../components/freeform/FreeformViewer';
import ModelTab from '../components/freeform/ModelTab';
import ShapeTab from '../components/freeform/ShapeTab';
import MaterialTab from '../components/freeform/MaterialTab';
import SaveTab from '../components/freeform/SaveTab';
import ModelThumb from '../components/freeform/ModelThumb';
import * as THREE from 'three';
import '../styles/freeform.css';

/* ─── Types ─── */

type Step = 'model' | 'shape' | 'material' | 'decor' | 'review';

/* ─── Constants ─── */

const STEPS: { key: Step; label: string; sublabel: string; num: number }[] = [
  { key: 'model', label: 'Model', sublabel: 'Choose your base', num: 1 },
  { key: 'shape', label: 'Shape', sublabel: 'Customize shape', num: 2 },
  { key: 'material', label: 'Material', sublabel: 'Select material', num: 3 },
  { key: 'decor', label: 'Decor', sublabel: 'Add decorations', num: 4 },
  { key: 'review', label: 'Review', sublabel: 'Preview & save', num: 5 },
];

const DEFAULT_SHAPE = { height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 };
const DEFAULT_MATERIAL = { finish: 'raw_clay', color: '#C4A882' };

const FINISH_LABELS: Record<string, string> = {
  raw_clay: 'Raw Clay',
  matte: 'Matte',
  ceramic: 'Ceramic',
  glazed: 'Glazed',
  metallic: 'Metallic',
};

/* ─── Component ─── */

export default function FreeformPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  /* Step & model state */
  const [activeStep, setActiveStep] = useState<Step>('model');
  const [selectedModel, setSelectedModel] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelCategory, setModelCategory] = useState('Vase');
  const [modelThumbnail, setModelThumbnail] = useState('');

  /* Design params */
  const [shapeParams, setShapeParams] = useState(DEFAULT_SHAPE);
  const [materialParams, setMaterialParams] = useState(DEFAULT_MATERIAL);

  /* Modals */
  const [showShopModal, setShowShopModal] = useState(false);
  const [shops, setShops] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [designName, setDesignName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  /* UI state */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.key === activeStep);

  /* ─── Helpers ─── */

  function selectModel(
    file: string,
    name: string,
    category = 'Vase',
    thumbnail = '',
    resetParams = true,
  ) {
    setSelectedModel(file);
    setModelName(name);
    setModelCategory(category || 'Vase');
    setModelThumbnail(thumbnail || '');
    if (resetParams) {
      setShapeParams(DEFAULT_SHAPE);
      setMaterialParams(DEFAULT_MATERIAL);
    }
  }

  function applyDesign(design: {
    model_file: string;
    model_name: string;
    shape_params: typeof DEFAULT_SHAPE;
    material_params: typeof DEFAULT_MATERIAL;
  }) {
    setSelectedModel(design.model_file);
    setModelName(design.model_name);
    setShapeParams(design.shape_params || DEFAULT_SHAPE);
    setMaterialParams(design.material_params || DEFAULT_MATERIAL);
  }

  function canGoTo(index: number) {
    if (index === 0) return true;
    if (!selectedModel) return false;
    return index <= stepIndex + 1;
  }

  /* ─── Bootstrap ─── */

  useEffect(() => {
    const navState = location.state as {
      modelUrl?: string;
      modelName?: string;
      modelCategory?: string;
      modelThumbnail?: string;
      color?: string;
    } | null;

    async function bootstrap() {
      const designId = searchParams.get('design');

      // Load from saved design URL
      if (designId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data } = await supabase
            .from('designs')
            .select('*')
            .eq('id', designId)
            .eq('user_id', session.user.id)
            .maybeSingle();
          if (data) {
            applyDesign(data);
            setActiveStep('review');
            return;
          }
        }
      }

      // Load from navigation state (e.g. from homepage preview)
      if (navState?.modelUrl) {
        selectModel(
          navState.modelUrl,
          navState.modelName || 'Selected Model',
          navState.modelCategory || 'Vase',
          navState.modelThumbnail || '',
          false,
        );
        if (navState.color) {
          setMaterialParams((prev) => ({ ...prev, color: navState.color! }));
        }
        return;
      }

      // Default: load latest model from Supabase
      const { data } = await supabase
        .from('models_3d')
        .select('file_url, name, category, thumbnail')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.file_url) {
        selectModel(data.file_url, data.name, data.category, data.thumbnail || '', false);
      }
    }

    bootstrap();
  }, []);

  /* ─── Viewport controls ─── */

  function handleControlsReady(controls: any, camera: THREE.Camera) {
    controlsRef.current = controls;
    cameraRef.current = camera;
  }

  function handleRotate() {
    const c = controlsRef.current;
    if (!c) return;
    c.autoRotate = !c.autoRotate;
    c.autoRotateSpeed = 4;
    c.update?.();
  }

  function handleZoomIn() {
    const cam = cameraRef.current;
    const c = controlsRef.current;
    if (!cam || !c) return;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    cam.position.addScaledVector(dir, 0.85);
    c.update?.();
  }

  function handleResetView() {
    const cam = cameraRef.current;
    const c = controlsRef.current;
    if (!cam || !c) return;
    cam.position.set(2.7, 1.32, 6);
    if (c.target) c.target.set(0, 0, 0);
    c.update?.();
  }

  function handleToggleFullscreen() {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  function captureScreenshot(): string | null {
    const canvas = document.querySelector('.freeform-viewer canvas') as HTMLCanvasElement;
    return canvas?.toDataURL('image/png') ?? null;
  }

  function handleScreenshot() {
    const url = captureScreenshot();
    if (!url) return;
    const link = document.createElement('a');
    link.download = `likhartisan-design-${Date.now()}.png`;
    link.href = url;
    link.click();
  }

  async function handleShare() {
    if (!selectedModel) {
      alert('Select a model before sharing.');
      return;
    }
    const url = captureScreenshot();
    if (!url) return;

    const title = modelName ? `${modelName} — LikhArtisan Design` : 'My LikhArtisan Design';
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'likhartisan-design.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text: 'Check out my custom pottery design!', files: [file] });
        return;
      }
    } catch {
      // fall through
    }
    handleScreenshot();
  }

  /* ─── Save design ─── */

  function openSaveModal() {
    if (!selectedModel) {
      alert('Please select a model before saving.');
      setActiveStep('model');
      return;
    }
    setSaveMessage('');
    setSaveModalOpen(true);
  }

  async function handleSaveDesign() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    if (!selectedModel) {
      alert('Please select a model before saving.');
      setActiveStep('model');
      return;
    }
    if (!designName.trim()) return;

    setSaving(true);
    setSaveMessage('');

    const thumbnail = captureScreenshot();
    const { error } = await supabase.from('designs').insert({
      user_id: session.user.id,
      name: designName.trim(),
      model_name: modelName,
      model_file: selectedModel,
      shape_params: shapeParams,
      material_params: materialParams,
      thumbnail: thumbnail || null,
    });

    setSaving(false);
    if (error) {
      setSaveMessage('Could not save design. Please try again.');
      return;
    }

    setSaveModalOpen(false);
    setDesignName('');
    setSaveMessage('');
    setActiveStep('review');
  }

  /* ─── Send to shop ─── */

  async function handleCheckout() {
    if (!selectedModel) {
      alert('Please select a model before sending to a shop.');
      setActiveStep('model');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    const { data } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setShops(data);
      setSelectedShop(null);
      setShowShopModal(true);
    } else {
      alert('No shops available yet.');
    }
  }

  async function handleSubmitToShop() {
    if (!selectedShop || !selectedModel) return;
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSubmitting(false); return; }

    const shop = shops.find((s) => s.id === selectedShop);
    if (!shop) { setSubmitting(false); return; }

    const payload = JSON.stringify({
      type: 'design_submission',
      message: 'I designed a custom pottery piece and would like to submit it for creation.',
      design: {
        model: modelName,
        model_file: selectedModel,
        shape: shapeParams,
        material: materialParams,
      },
    });

    // Find or create conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('buyer_id', session.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();

    let convId = existing?.id;
    if (!convId) {
      const meta = session.user.user_metadata || {};
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          buyer_id: session.user.id,
          shop_id: shop.id,
          shop_name: shop.name,
          buyer_name: meta.name || session.user.email || 'Buyer',
          buyer_avatar: meta.avatar_url || '',
          last_message: payload,
          last_message_at: new Date().toISOString(),
          buyer_unread: 0,
          artisan_unread: 1,
        })
        .select('id')
        .single();
      if (error) {
        alert('Could not start conversation. Please try again.');
        setSubmitting(false);
        return;
      }
      convId = newConv?.id;
    }

    // Send message
    if (convId) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: session.user.id,
        text: payload,
      });
      await supabase
        .from('conversations')
        .update({ last_message: payload, last_message_at: new Date().toISOString(), artisan_unread: 1 })
        .eq('id', convId);
    }

    setSubmitting(false);
    setShowShopModal(false);
    navigate('/chat');
  }

  /* ─── Derived state ─── */

  const completedSteps = STEPS.filter((_, i) => i < stepIndex).map((s) => s.key);
  const estimatedPrice =
    materialParams.finish === 'metallic' ? 1850 : materialParams.finish === 'glazed' ? 1450 : 1250;
  const estimatedDays =
    materialParams.finish === 'metallic' ? 10 : materialParams.finish === 'glazed' ? 7 : 5;

  /* ─── Render ─── */

  return (
    <div className="freeform-page">

      {/* ── STEPPER ── */}
      <div className="freeform-stepper">
        <div className="freeform-stepper-track">
          {STEPS.map((step, i) => {
            const isActive = step.key === activeStep;
            const isCompleted = completedSteps.includes(step.key);
            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => { if (canGoTo(i)) setActiveStep(step.key); }}
                  className={`freeform-step-btn${isActive ? ' active' : ''}`}
                >
                  <div className={`freeform-step-circle${isActive ? ' active' : isCompleted ? ' completed' : ' upcoming'}`}>
                    {isCompleted && !isActive ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: '14px', height: '14px' }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : step.num}
                  </div>
                  <div className="freeform-step-label">
                    <div className="freeform-step-title">{step.label}</div>
                    <div className="freeform-step-subtitle">{step.sublabel}</div>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`freeform-step-connector${isCompleted ? ' completed' : ''}`} />
                )}
              </div>
            );
          })}
        </div>
        <button onClick={() => { setShapeParams(DEFAULT_SHAPE); setMaterialParams(DEFAULT_MATERIAL); }} className="freeform-reset-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" /><path d="M3 3v5h5" />
          </svg>
          Reset Design
        </button>
      </div>

      {/* ── MAIN ── */}
      <div className="freeform-main">

        {/* ── LEFT SIDEBAR ── */}
        <div className="freeform-sidebar">
          <div className="freeform-sidebar-inner">
            <div className="freeform-sidebar-upper">
              <div className="freeform-sidebar-header">
                <h2 className="freeform-sidebar-title">Customization</h2>
              </div>
            </div>

            <div className="freeform-sidebar-scroll">
              <div className="freeform-tab-section">
                {activeStep === 'model' && (
                  <ModelTab selectedModel={selectedModel} onSelect={(f, n, c, t) => selectModel(f, n, c, t)} />
                )}
                {activeStep === 'shape' && <ShapeTab shapeParams={shapeParams} onChange={setShapeParams} />}
                {activeStep === 'material' && <MaterialTab materialParams={materialParams} onChange={setMaterialParams} />}
                {activeStep === 'decor' && (
                  <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '48px', height: '48px', margin: '0 auto 16px', opacity: 0.5 }}>
                      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                    </svg>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>Coming Soon</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Text engraving and decorations will be available in a future update.</p>
                  </div>
                )}
                {activeStep === 'review' && (
                  <div>
                    <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="1.5" style={{ width: '40px', height: '40px', margin: '0 auto 12px' }}>
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>Design Complete</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Review your choices and save or send to a shop.</p>
                    </div>
                    <SaveTab
                      onLoad={(d) => { applyDesign(d); setActiveStep('review'); }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── CENTER: 3D VIEWER ── */}
        <div ref={viewerRef} className="freeform-viewer-wrap">
          <div className="freeform-floor-shadow" />

          <div className="freeform-instruction-pill">
            {[
              { icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5', label: 'Drag to rotate' },
              { icon: 'M12 5v14M5 12l7 7 7-7', label: 'Scroll to zoom' },
              { icon: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7', label: 'Right click to pan' },
            ].map((item, i) => (
              <div key={i} className="freeform-instruction-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" style={{ width: '14px', height: '14px' }}>
                  <path d={item.icon} />
                </svg>
                <span className="freeform-instruction-text">{item.label}</span>
                {i < 2 && <span className="freeform-instruction-dot">&#8226;</span>}
              </div>
            ))}
          </div>

          <div className="freeform-viewer-canvas freeform-viewer">
            <FreeformViewer
              modelFile={selectedModel}
              shapeParams={shapeParams}
              materialParams={materialParams}
              onMorphDetected={() => {}}
              onControlsReady={handleControlsReady}
            />
          </div>

          <div className="freeform-toolbar">
            {[
              { icon: 'M23 4v6h-6M1 20v-6h6', label: 'Rotate', action: handleRotate },
              { icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7', label: 'Zoom', action: handleZoomIn },
              { icon: 'M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8', label: 'Reset View', action: handleResetView },
              { icon: isFullscreen ? 'M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3' : 'M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3', label: 'Fullscreen', action: handleToggleFullscreen },
              { icon: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a5 5 0 100-10 5 5 0 000 10z', label: 'Screenshot', action: handleScreenshot },
              { icon: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13', label: 'Share', action: handleShare },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.action} title={btn.label} className="freeform-toolbar-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dark)" strokeWidth="1.8" style={{ width: '22px', height: '22px' }}>
                  <path d={btn.icon} />
                </svg>
                <span className="freeform-toolbar-label">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM SUMMARY BAR ── */}
      <div className="freeform-bottom-wrap">
        <div className="freeform-summary-bar">
          <div className="freeform-summary-details">
            <div className="freeform-summary-field">
              <div className="freeform-summary-product">
                <div className="freeform-model-thumb">
                  <ModelThumb thumbnail={modelThumbnail} size={48} />
                </div>
                <div>
                  <div className="freeform-summary-product-name">{modelName || 'No Model'}</div>
                  <div className="freeform-summary-product-type">{modelCategory}</div>
                </div>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-swatch" style={{ background: materialParams.color }} />
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Material</span>
                <span className="freeform-summary-field-value" style={{ textTransform: 'capitalize' }}>{FINISH_LABELS[materialParams.finish]}</span>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-icon" style={{ borderStyle: 'dashed' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>Aa</span>
              </div>
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Decor</span>
                <span className="freeform-summary-field-value">None</span>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                  <path d="M21 3H3v18h18V3zM9 3v18M15 3v18M3 9h18M3 15h18" />
                </svg>
              </div>
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Dimensions</span>
                <span className="freeform-summary-field-value">H {shapeParams.height}cm &middot; W {shapeParams.bodyWidth}cm</span>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                  <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              </div>
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Est. Price</span>
                <span className="freeform-summary-price">&#8369;{estimatedPrice.toLocaleString()}.00</span>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '20px', height: '20px' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Est. Production</span>
                <span className="freeform-summary-field-value">{estimatedDays} Days</span>
              </div>
            </div>
          </div>

          <div className="freeform-summary-actions">
            <button onClick={openSaveModal} className="freeform-summary-save">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              Save Design
            </button>
            <button onClick={handleCheckout} className="freeform-summary-action" title="Send to Shop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </button>
          </div>
        </div>

        <div className="freeform-bottom-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '14px', height: '14px' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          You can review and save your design anytime.
        </div>
      </div>

      {/* ── SAVE DESIGN MODAL ── */}
      {saveModalOpen && (
        <div className="freeform-modal-overlay" onClick={() => setSaveModalOpen(false)}>
          <div className="freeform-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '28px 28px 0' }}>
              <h3 className="freeform-modal-title">Save Your Design</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Give your creation a name to save it.</p>
            </div>
            <div style={{ padding: '20px 28px' }}>
              <label className="freeform-tab-subheading">Design Name</label>
              <input
                type="text"
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                placeholder="e.g. My Custom Vase"
                className="freeform-modal-input"
              />
            </div>
            {saveMessage && (
              <p style={{ fontSize: '0.82rem', color: '#C0392B', marginTop: '8px', padding: '0 28px' }}>{saveMessage}</p>
            )}
            <div style={{ padding: '0 28px 28px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setSaveModalOpen(false)} className="freeform-tab-btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button
                onClick={handleSaveDesign}
                disabled={!designName.trim() || saving}
                className="freeform-save-btn"
                style={{ flex: 1, marginBottom: 0, opacity: !designName.trim() || saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHOP SELECTION MODAL ── */}
      {showShopModal && (
        <div className="freeform-modal-overlay" onClick={() => setShowShopModal(false)}>
          <div className="freeform-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '28px 28px 0' }}>
              <h3 className="freeform-modal-title">Select a Shop</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Choose who to send your design to</p>
            </div>
            <div style={{ padding: '16px 28px', maxHeight: '320px', overflowY: 'auto' }}>
              {shops.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShop(s.id)}
                  className={`freeform-tab-option${selectedShop === s.id ? ' selected' : ''}`}
                  style={{ marginBottom: '8px' }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {s.image ? (
                      <img src={s.image} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--primary-color)' }}>{s.name.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)' }}>{s.name}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ padding: '16px 28px 28px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowShopModal(false)} className="freeform-tab-btn-outline" style={{ flex: 1 }}>Cancel</button>
              <button
                onClick={handleSubmitToShop}
                disabled={!selectedShop || submitting}
                className="freeform-save-btn"
                style={{ flex: 1, marginBottom: 0, opacity: !selectedShop || submitting ? 0.5 : 1 }}
              >
                {submitting ? 'Sending...' : 'Send Design'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
