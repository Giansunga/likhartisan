import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../lib/api';
import { FALLBACK_BUYER_NAME } from '../lib/constants';
import FreeformViewer from '../components/freeform/FreeformViewer';
import ModelTab from '../components/freeform/ModelTab';
import ShapeTab from '../components/freeform/ShapeTab';
import MaterialTab from '../components/freeform/MaterialTab';
import DecorTab from '../components/freeform/DecorTab';
import AttachmentTab from '../components/freeform/AttachmentTab';
import SaveTab from '../components/freeform/SaveTab';
import ModelThumb from '../components/freeform/ModelThumb';
import ShopSelectModal from '../components/freeform/ShopSelectModal';
import SavedDesignsModal from '../components/freeform/SavedDesignsModal';
import { type SavedDesign } from '../hooks/useSavedDesigns';
import { DEFAULT_DECORATION, getPattern, type DecorationParams } from '../components/freeform/decor';
import { FINISHES } from '../components/freeform/materials';
import { attachmentTotals, normalizeAttachmentSelections, selectedSocketIds, type AttachmentSelection, type GeneratedAttachmentSocket } from '../components/freeform/attachments';
import type { AttachmentPlacementLimitMap } from '../components/freeform/attachmentPlacement';
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
function getFinishLabel(finishId: string): string {
  return FINISHES.find((f) => f.id === finishId)?.label || finishId.replace(/_/g, ' ');
}

const COLOR_NAMES: Record<string, string> = {
  '#C4A882': 'Terracotta', '#A0522D': 'Sienna', '#8B4513': 'Saddle Brown',
  '#D2691E': 'Chocolate', '#CD853F': 'Peru', '#DEB887': 'Burlywood',
  '#B8860B': 'Dark Goldenrod', '#DAA520': 'Goldenrod', '#F4A460': 'Sandy Brown',
  '#E8C39E': 'Warm Beige', '#2E8B57': 'Sea Green', '#3CB371': 'Medium Sea Green',
  '#66CDAA': 'Aquamarine', '#8FBC8F': 'Dark Sea Green', '#228B22': 'Forest Green',
  '#006400': 'Dark Green', '#556B2F': 'Olive', '#6B8E23': 'Olive Drab',
  '#4682B4': 'Steel Blue', '#5F9EA0': 'Cadet Blue', '#87CEEB': 'Sky Blue',
  '#4169E1': 'Royal Blue', '#1E90FF': 'Dodger Blue', '#0000CD': 'Medium Blue',
  '#8B0000': 'Dark Red', '#B22222': 'Firebrick', '#DC143C': 'Crimson',
  '#FF6347': 'Tomato', '#FF4500': 'Orange Red', '#FF8C00': 'Dark Orange',
  '#FFD700': 'Gold', '#FFFFFF': 'White',
};

/* ─── Component ─── */

export default function FreeformPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  /* Step & model state */
  const [activeStep, setActiveStep] = useState<Step>('model');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelCategory, setModelCategory] = useState('Vase');
  const [modelThumbnail, setModelThumbnail] = useState('');

  /* Design params */
  const [shapeParams, setShapeParams] = useState(DEFAULT_SHAPE);
  const [materialParams, setMaterialParams] = useState(DEFAULT_MATERIAL);
  const [decorationParams, setDecorationParams] = useState<DecorationParams>(DEFAULT_DECORATION);
  const [attachmentParams, setAttachmentParams] = useState<AttachmentSelection[]>([]);
  const [attachmentSockets, setAttachmentSockets] = useState<GeneratedAttachmentSocket[]>([]);
  const [attachmentPlacementLimits, setAttachmentPlacementLimits] = useState<AttachmentPlacementLimitMap>({});

  /* Shop selection (freeform entry) */
  const [shopSelectOpen, setShopSelectOpen] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedShopName, setSelectedShopName] = useState('');

  /* Modals */
  const [showShopModal, setShowShopModal] = useState(false);
  const [shops, setShops] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [designName, setDesignName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [savedDesignsOpen, setSavedDesignsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  /* UI state */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAttachmentSockets, setShowAttachmentSockets] = useState(true);
  const viewerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const shopModalShownRef = useRef(false);
  const { user } = useAuth();

  const stepIndex = STEPS.findIndex((s) => s.key === activeStep);

  /* ─── Helpers ─── */

  function selectModel(
    file: string,
    name: string,
    category = 'Vase',
    thumbnail = '',
    id: string | null = null,
    resetParams = true,
  ) {
    setSelectedModel(file);
    setSelectedModelId(id);
    setModelName(name);
    setModelCategory(category || 'Vase');
    setModelThumbnail(thumbnail || '');
    if (resetParams) {
      setShapeParams(DEFAULT_SHAPE);
      setMaterialParams(DEFAULT_MATERIAL);
      setDecorationParams(DEFAULT_DECORATION);
      if (attachmentParams.length) toast.info('Attachments were removed because the base model changed.');
      setAttachmentParams([]);
      setAttachmentSockets([]);
      setAttachmentPlacementLimits({});
    }
  }

function applyDesign(design: {
    model_file: string;
    model_id?: string | null;
    model_name: string;
    shop_id?: string;
    shop_name?: string;
    shape_params: typeof DEFAULT_SHAPE;
    material_params: typeof DEFAULT_MATERIAL;
    decor_params?: DecorationParams;
    attachment_params?: unknown;
  }) {
    setSelectedModel(design.model_file);
    setSelectedModelId(design.model_id || null);
    setModelName(design.model_name);
    setShapeParams(design.shape_params || DEFAULT_SHAPE);
    setMaterialParams(design.material_params || DEFAULT_MATERIAL);
    setDecorationParams(design.decor_params || DEFAULT_DECORATION);
    setAttachmentParams(normalizeAttachmentSelections(design.attachment_params));
    setAttachmentSockets([]);
    setAttachmentPlacementLimits({});
    setHasUnsavedChanges(false);
    if (design.shop_id) {
      setSelectedShopId(design.shop_id);
      setSelectedShopName(design.shop_name || '');
    }
  }

  async function handleLoadSavedDesign(design: SavedDesign) {
    if (selectedShopId && design.shop_id && design.shop_id !== selectedShopId) {
      const ok = confirm(`Switch Shop?\n\nThis design was created for ${design.shops?.name || 'another shop'}.\nLoading it will switch your current shop and replace the current design.`);
      if (!ok) return;
    }

    if (hasUnsavedChanges && selectedModel) {
      const ok = confirm(`Replace Current Design?\n\nYour current changes have not been saved.\nLoading another design will replace them.`);
      if (!ok) return;
    }

    try {
      if (design.shops?.name) {
        setSelectedShopId(design.shop_id);
        setSelectedShopName(design.shops.name);
      }

      setSelectedModel(design.model_file);
      setSelectedModelId(design.model_id || null);
      setModelName(design.model_name);
      setModelCategory(design.models_3d?.category || 'Vase');
      setModelThumbnail(design.models_3d?.thumbnail || design.thumbnail || '');

      setShapeParams(design.shape_params || DEFAULT_SHAPE);
      setMaterialParams(design.material_params || DEFAULT_MATERIAL);
      setDecorationParams(design.decor_params || DEFAULT_DECORATION);
      setAttachmentParams(normalizeAttachmentSelections(design.attachment_params));
      setAttachmentSockets([]);
      setAttachmentPlacementLimits({});
      setHasUnsavedChanges(false);

      setActiveStep('review');
      setSavedDesignsOpen(false);

      toast.success(`Loaded "${design.name}"`);
    } catch {
      toast.error('Could load this design.');
    }
  }

  function canGoTo(index: number) {
    if (index === 0) return true;
    if (!selectedModel) return false;
    return index <= stepIndex + 1;
  }

  /* ─── Bootstrap ─── */

  useEffect(() => {
    const navState = location.state as {
      modelId?: string;
      modelUrl?: string;
      modelName?: string;
      modelCategory?: string;
      modelThumbnail?: string;
      color?: string;
    } | null;

    async function bootstrap() {
      const designId = searchParams.get('design');

      // Load from saved design URL — forces shop context
      if (designId) {
        if (user) {
          const { data } = await supabase
            .from('designs')
            .select('*')
            .eq('id', designId)
            .eq('user_id', user.id)
            .maybeSingle();
          if (data) {
            // Fetch shop name if shop_id exists
            let shopName = '';
            if (data.shop_id) {
              const { data: shop } = await supabase
                .from('shops')
                .select('name')
                .eq('id', data.shop_id)
                .maybeSingle();
              shopName = shop?.name || '';
            }
            const modelQuery = data.model_id
              ? supabase.from('models_3d').select('id,category,thumbnail').eq('id', data.model_id)
              : supabase.from('models_3d').select('id,category,thumbnail').eq('file_url', data.model_file);
            const { data: savedModel } = await modelQuery.maybeSingle();
            applyDesign({ ...data, model_id: savedModel?.id || data.model_id, shop_name: shopName });
            setModelCategory(savedModel?.category || 'Vase');
            setModelThumbnail(savedModel?.thumbnail || data.thumbnail || '');
            setActiveStep('review');
            return;
          }
        }
      }

      // Load from navigation state (e.g. from homepage preview) — requires shop selection
      if (navState?.modelUrl) {
        selectModel(
          navState.modelUrl,
          navState.modelName || 'Selected Model',
          navState.modelCategory || 'Vase',
          navState.modelThumbnail || '',
          navState.modelId || null,
          false,
        );
        if (navState.color) {
          setMaterialParams((prev) => ({ ...prev, color: navState.color! }));
        }
        if (!shopModalShownRef.current) {
          shopModalShownRef.current = true;
          setShopSelectOpen(true);
        }
        return;
      }

      // Default: do nothing — user sees empty state with Start/Load buttons
    }

    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (selectedModel) setHasUnsavedChanges(true);
  }, [selectedModel, shapeParams, materialParams, decorationParams, attachmentParams]);

  /* ─── Viewport controls ─── */

  function handleControlsReady(controls: any, camera: THREE.Camera) {
    controlsRef.current = controls;
    cameraRef.current = camera;
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

  /* ─── Save design ─── */

  function openSaveModal() {
    if (!selectedModel) {
      toast.error('Please select a model before saving.');
      setActiveStep('model');
      return;
    }
    setSaveMessage('');
    setSaveModalOpen(true);
  }

  async function handleSaveDesign() {
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    if (!selectedModel) {
      toast.error('Please select a model before saving.');
      setActiveStep('model');
      return;
    }
    if (!designName.trim()) return;

    setSaving(true);
    setSaveMessage('');

    const thumbnail = captureScreenshot();
    const { error } = await supabase.from('designs').insert({
      user_id: user.id,
      name: designName.trim(),
      shop_id: selectedShopId,
      model_name: modelName,
      model_id: selectedModelId,
      model_file: selectedModel,
      shape_params: shapeParams,
      material_params: materialParams,
      decor_params: decorationParams,
      attachment_params: attachmentParams,
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
      toast.error('Please select a model before sending to a shop.');
      setActiveStep('model');
      return;
    }
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }

    // Default to the design's associated shop if available
    if (selectedShopId) {
      const { data: shop } = await supabase.from('shops').select('*').eq('id', selectedShopId).maybeSingle();
      if (shop) {
        setShops([shop]);
        setSelectedShop(shop.id);
        setShowShopModal(true);
        return;
      }
    }

    const { data } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setShops(data);
      setSelectedShop(null);
      setShowShopModal(true);
    } else {
      toast.error('No shops available yet.');
    }
  }

  async function handleSubmitToShop() {
    if (!selectedShop || !selectedModel) return;
    setSubmitting(true);

    if (!user) { setSubmitting(false); return; }

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
        decor: decorationParams,
        attachments: attachmentParams,
      },
    });

    // Find or create conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('buyer_id', user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();

    let convId = existing?.id;
    if (!convId) {
      const meta = user.user_metadata || {};
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          buyer_id: user.id,
          shop_id: shop.id,
          shop_name: shop.name,
          buyer_name: meta.name || user.email || FALLBACK_BUYER_NAME,
          buyer_avatar: meta.avatar_url || '',
          last_message: payload,
          last_message_at: new Date().toISOString(),
          buyer_unread: 0,
          artisan_unread: 1,
        })
        .select('id')
        .single();
      if (error) {
        toast.error('Could not start conversation. Please try again.');
        setSubmitting(false);
        return;
      }
      convId = newConv?.id;
    }

    // Send message
    if (convId) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        text: payload,
      });
      await supabase
        .from('conversations')
        .update({ last_message: payload, last_message_at: new Date().toISOString(), artisan_unread: 1 })
        .eq('id', convId);
      // Create real notification for shop owner via backend API to bypass RLS
      try {
        const { data: shopOwner } = await supabase.from('shops').select('owner_id').eq('id', shop.id).single();
        if (shopOwner?.owner_id) {
          const meta = user?.user_metadata || {};
          const buyerName = meta.name || user?.email || FALLBACK_BUYER_NAME;
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(`${API_BASE}/api/notifications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session ? { Authorization: `Bearer ${session.access_token}` } : {})
            },
            body: JSON.stringify({
              user_id: shopOwner.owner_id,
              type: 'message',
              title: 'Design Inquiry',
              message: `${buyerName}: ${payload.substring(0, 80)}`,
              product_image: '',
            })
          });
        }
      } catch (e) { console.error('Failed to create message notification:', e); }
    }

    setSubmitting(false);
    setShowShopModal(false);
    navigate('/chat');
  }

  /* ─── Derived state ─── */

  const completedSteps = STEPS.filter((_, i) => i < stepIndex).map((s) => s.key);
  const basePrice =
    materialParams.finish === 'acrylic_paint' ? 1350 :
    materialParams.finish === 'water_paint' ? 1300 :
    materialParams.finish === 'glazed' ? 1450 : 1250;
  const baseDays =
    materialParams.finish === 'acrylic_paint' ? 6 :
    materialParams.finish === 'water_paint' ? 6 :
    materialParams.finish === 'glazed' ? 7 : 5;
  const attachmentEstimate = attachmentTotals(attachmentParams);
  const estimatedPrice = basePrice + attachmentEstimate.price;
  const estimatedDays = baseDays + attachmentEstimate.productionDays;

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
              {selectedShopId && (
                <button
                  onClick={() => { shopModalShownRef.current = true; setShopSelectOpen(true); }}
                  className="freeform-load-saved-btn"
                >
                  Switch Shop
                </button>
              )}
              <button onClick={() => setSavedDesignsOpen(true)} className="freeform-load-saved-btn">
                Load Saved Design
              </button>
            </div>

            <div className="freeform-sidebar-scroll">
              <div className="freeform-tab-section">
{activeStep === 'model' && (selectedShopId ? (
                  <ModelTab selectedModel={selectedModel} shopId={selectedShopId} onSelect={(f, n, c, t, id) => selectModel(f, n, c, t, id)} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '40px', height: '40px', margin: '0 auto 12px', opacity: 0.5 }}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      <polyline points="9 22 9 12h6v10" />
                    </svg>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Choose a shop to browse pottery models</p>
                    <button onClick={() => { shopModalShownRef.current = true; setShopSelectOpen(true); }} className="freeform-save-btn" style={{ width: '100%' }}>
                      Select a Shop
                    </button>
                  </div>
                ))}
                {activeStep === 'shape' && <ShapeTab shapeParams={shapeParams} onChange={setShapeParams} />}
                {activeStep === 'material' && <MaterialTab materialParams={materialParams} onChange={setMaterialParams} shopName={selectedShopName} />}
                {activeStep === 'decor' && <>
                  <DecorTab decoration={decorationParams} onChange={setDecorationParams} />
                  <AttachmentTab shopId={selectedShopId} modelId={selectedModelId} sockets={attachmentSockets} modelHeightCm={shapeParams.height} value={attachmentParams} placementLimits={attachmentPlacementLimits} onChange={setAttachmentParams} onCompatibilityWarning={(message) => toast.info(message)} />
                </>}
                {activeStep === 'review' && (
                  <div>
<div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="1.5" style={{ width: '40px', height: '40px', margin: '0 auto 12px' }}>
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>Design Complete</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Review your choices and save or send to a shop.</p>
                    </div>
                    <button onClick={openSaveModal} className="freeform-save-btn" style={{ width: '100%', marginBottom: '16px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                      </svg>
                      Save Design
</button>
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

          <div className="freeform-instruction-pill">
            {[
              { icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5', label: 'Drag to rotate' },
              { icon: 'M12 5v14M5 12l7 7 7-7', label: 'Scroll to zoom' },
            ].map((item, i) => (
              <div key={i} className="freeform-instruction-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" style={{ width: '14px', height: '14px' }}>
                  <path d={item.icon} />
                </svg>
                <span className="freeform-instruction-text">{item.label}</span>
                {i < 1 && <span className="freeform-instruction-dot">&#8226;</span>}
              </div>
            ))}
          </div>

          <div className="freeform-viewer-canvas freeform-viewer">
            <FreeformViewer
              modelFile={selectedModel}
              shapeParams={shapeParams}
              materialParams={materialParams}
              decorationParams={decorationParams}
              attachmentParams={attachmentParams}
              attachmentSockets={attachmentSockets}
              showAttachmentSockets={activeStep === 'decor' && showAttachmentSockets}
              selectedSocketIds={[...selectedSocketIds(attachmentParams)]}
              onSocketsChange={setAttachmentSockets}
              onAttachmentLimitsChange={setAttachmentPlacementLimits}
              onMorphDetected={() => {}}
              onControlsReady={handleControlsReady}
              onAttachmentError={(attachment) => toast.error(`${attachment.name} could not be loaded. The rest of your design is still available.`)}
            />
          </div>

          <div className="freeform-toolbar">
            {activeStep === 'decor' && (
              <button
                type="button"
                onClick={() => setShowAttachmentSockets((visible) => !visible)}
                title={showAttachmentSockets ? 'Hide Sockets' : 'Show Sockets'}
                aria-label={showAttachmentSockets ? 'Hide socket places' : 'Show socket places'}
                aria-pressed={showAttachmentSockets}
                className="freeform-toolbar-btn"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dark)" strokeWidth="1.8" style={{ width: '22px', height: '22px' }}>
                  {showAttachmentSockets ? (
                    <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>
                  ) : (
                    <><path d="M3 3l18 18" /><path d="M10.6 6.2A11.7 11.7 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-2.1 2.8M6.5 6.5C3.6 8.3 2 12 2 12s3.5 6 10 6a10.8 10.8 0 004.1-.8" /></>
                  )}
                </svg>
                <span className="freeform-toolbar-label">{showAttachmentSockets ? 'Hide Sockets' : 'Show Sockets'}</span>
              </button>
            )}
{[
              { icon: 'M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8', label: 'Reset View', action: handleResetView },
              { icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM14 14l-2-2-2 2M12 12V2', label: 'Reset Design', action: () => { setShapeParams(DEFAULT_SHAPE); setMaterialParams(DEFAULT_MATERIAL); setDecorationParams(DEFAULT_DECORATION); setAttachmentParams([]); } },
              { icon: isFullscreen ? 'M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3' : 'M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3', label: 'Fullscreen', action: handleToggleFullscreen },
              { icon: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a5 5 0 100-10 5 5 0 000 10z', label: 'Screenshot', action: handleScreenshot },
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

{/* ── RIGHT SUMMARY PANEL ── */}
        <div className="freeform-summary-panel">
          <div className="freeform-summary-panel-inner">
            <div className="freeform-summary-header">
              <h2 className="freeform-summary-title">Design Summary</h2>
            </div>

            <div className="freeform-summary-content">
              <div className="freeform-summary-row">
                <div className="freeform-model-thumb">
                  <ModelThumb thumbnail={modelThumbnail} size={42} />
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-value">{modelName || 'No Model'}</span>
                  <span className="freeform-summary-row-label">{selectedShopName || modelCategory}</span>
                </div>
              </div>

              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '18px', height: '18px' }}>
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">FINISH</span>
                  <span className="freeform-summary-row-value">{getFinishLabel(materialParams.finish)}</span>
                </div>
              </div>

              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <div className="freeform-summary-row-swatch" style={{ background: materialParams.color }} />
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">COLOR</span>
                  <span className="freeform-summary-row-value">{materialParams.color.toUpperCase()}{COLOR_NAMES[materialParams.color.toUpperCase()] ? ` · ${COLOR_NAMES[materialParams.color.toUpperCase()]}` : ''}</span>
                </div>
              </div>

              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>Aa</span>
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">DECOR</span>
                  <span className="freeform-summary-row-value">{getPattern(decorationParams.patternId)?.name || 'None'}</span>
                </div>
              </div>

              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '18px', height: '18px' }}>
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 5m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">ATTACHMENTS</span>
                  {attachmentParams.length === 0 ? (
                    <span className="freeform-summary-row-value">None</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {attachmentParams.map((a) => (
                        <div key={a.id} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dark)', lineHeight: '1.35' }}>
                          {a.name}{a.placements.length === 2 ? ` \u00d7 2` : ''}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                            {' '}&mdash;{' '}{a.placements.map((p) => p.socket.name).join(' + ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '18px', height: '18px' }}>
                    <path d="M21 3H3v18h18V3zM9 3v18M15 3v18M3 9h18M3 15h18" />
                  </svg>
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">DIMENSIONS</span>
                  <span className="freeform-summary-row-value">H {shapeParams.height}cm &middot; W {shapeParams.bodyWidth}cm</span>
                </div>
              </div>
</div>

            <div className="freeform-summary-footer">
              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '18px', height: '18px' }}>
                    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">EST. PRICE</span>
                  <span className="freeform-price-total">&#8369;{estimatedPrice.toLocaleString()}.00</span>
                </div>
              </div>

              <div className="freeform-summary-row">
                <div className="freeform-summary-row-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ width: '18px', height: '18px' }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div className="freeform-summary-row-info">
                  <span className="freeform-summary-row-label">EST. PRODUCTION</span>
                  <span className="freeform-summary-row-value">{estimatedDays} Days</span>
                </div>
              </div>

              <button onClick={handleCheckout} className="freeform-summary-send-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                </svg>
                Send to Shop
              </button>
            </div>
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
                  <div className="freeform-summary-product-type">{selectedShopName || modelCategory}</div>
                </div>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-swatch" style={{ background: materialParams.color }} />
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Material</span>
                <span className="freeform-summary-field-value" style={{ textTransform: 'capitalize' }}>{getFinishLabel(materialParams.finish)}</span>
              </div>
            </div>

            <div className="freeform-summary-divider" />

            <div className="freeform-summary-field">
              <div className="freeform-summary-icon" style={{ borderStyle: 'dashed' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>Aa</span>
              </div>
              <div className="freeform-summary-field-text">
                <span className="freeform-summary-field-label">Decor</span>
                <span className="freeform-summary-field-value">{getPattern(decorationParams.patternId)?.name || 'None'}{attachmentParams.length ? ` · ${attachmentParams.length} 3D` : ''}</span>
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
            <button onClick={handleCheckout} className="freeform-summary-save" title="Send to Shop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
              Send to Shop
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

      {/* ── SHOP SELECT MODAL (freeform entry) ── */}
      <ShopSelectModal
        open={shopSelectOpen}
        onSelect={(id, name) => {
          if (selectedShopId !== id && attachmentParams.length) {
            const compatibleAttachments = attachmentParams.filter((attachment) => !attachment.shopId || attachment.shopId === id);
            if (compatibleAttachments.length !== attachmentParams.length) {
              setAttachmentParams(compatibleAttachments);
              toast.info('Attachments unavailable at the new shop were removed.');
            }
            setAttachmentSockets([]);
            setAttachmentPlacementLimits({});
          }
          setSelectedShopId(id);
          setSelectedShopName(name);
          setShopSelectOpen(false);
        }}
      />
      <SavedDesignsModal
        open={savedDesignsOpen}
        currentShopId={selectedShopId}
        onClose={() => setSavedDesignsOpen(false)}
        onLoad={handleLoadSavedDesign}
      />
    </div>
  );
}
