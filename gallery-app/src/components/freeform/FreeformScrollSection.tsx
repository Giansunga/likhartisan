import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useMotionValueEvent, useSpring } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { DEFAULT_ATTACHMENT_TRANSFORM, type AttachmentSelection } from './attachments';
import type { DecorationParams } from './decor';
import type { KnownFinishId } from './materials';

const FreeformViewer = lazy(() => import('./FreeformViewer'));

const LANDING_HANDLE_HEIGHT = 0.485;

const FEATURED_ATTACHMENT: AttachmentSelection = {
  version: 4,
  id: 'landing-bamboo-loop-pair',
  recipeKey: 'bamboo-loop',
  recipeVersion: 1,
  name: 'Bamboo Loop',
  family: 'handle',
  shopId: null,
  placements: [
    {
      socket: {
        id: 'landing-handle-left',
        name: 'Left handle',
        family: 'handle',
        height: LANDING_HANDLE_HEIGHT,
        azimuth: -90,
        pairGroup: 'landing-handle-pair',
      },
      transform: { ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier: 1.05 },
    },
    {
      socket: {
        id: 'landing-handle-right',
        name: 'Right handle',
        family: 'handle',
        height: LANDING_HANDLE_HEIGHT,
        azimuth: 90,
        pairGroup: 'landing-handle-pair',
      },
      transform: { ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier: 1.05 },
    },
  ],
  priceAdjustment: 0,
  productionDaysAdjustment: 0,
};

export default function FreeformScrollSection() {
  const navigate = useNavigate();
  
  // Freeform preview state
  const [previewModel, setPreviewModel] = useState<string | null>(null);
  const [previewModelMeta, setPreviewModelMeta] = useState<{ name: string; category: string; thumbnail: string } | null>(null);
  const freeformSectionRef = useRef<HTMLDivElement>(null);
  const [freeformVisible, setFreeformVisible] = useState(false);
  const [previewColor, setPreviewColor] = useState('#BE734F');

  // Framer motion scroll setup
  const { scrollYProgress } = useScroll({ target: freeformSectionRef, offset: ['start start', 'end end'] });
  const bgTransform = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], ['var(--bg-secondary)', '#1A1512', '#1A1512', 'var(--bg-secondary)']);
  const colorTransform = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], ['#2C1810', '#FDFDFB', '#FDFDFB', '#2C1810']);
  
  // Dynamic shape params
  const [scrollShape, setScrollShape] = useState({ height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 });
  const [scrollFinish, setScrollFinish] = useState<KnownFinishId>('raw_clay');
  const [scrollAttachments, setScrollAttachments] = useState<AttachmentSelection[]>([]);
  const [scrollDecoration, setScrollDecoration] = useState<DecorationParams>({
    patternId: '',
    placement: 'middle',
    scale: 1,
    color: '#7A3E12',
    effect: 'engraved',
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.3) {
      setScrollShape({ height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 });
      setScrollFinish('raw_clay');
      setPreviewColor('#BE734F');
      setScrollAttachments((current) => current.length ? [] : current);
      setScrollDecoration((current) => current.patternId ? { ...current, patternId: '' } : current);
    } else if (latest < 0.6) {
      const p = (latest - 0.3) / 0.3; // 0 to 1
      setScrollShape({ 
        height: 25 + p * 15, 
        bodyWidth: 20 + p * 40, 
        neckWidth: 15 - p * 5,
        rimSize: 12 + p * 8,
        curvature: 50 + p * 50
      });
      setScrollFinish('raw_clay');
      setPreviewColor('#BE734F');
      setScrollAttachments((current) => current.length ? [] : current);
      setScrollDecoration((current) => current.patternId ? { ...current, patternId: '' } : current);
    } else {
      setScrollShape({ height: 40, bodyWidth: 60, neckWidth: 10, rimSize: 20, curvature: 100 });
      const p = (latest - 0.6) / 0.4;
      if (p < 0.25) {
        setScrollFinish('glazed');
        setPreviewColor('#A0522D');
        setScrollAttachments((current) => current.length ? [] : current);
        setScrollDecoration((current) => current.patternId ? { ...current, patternId: '' } : current);
      } else if (p < 0.5) {
        setScrollFinish('ceramic');
        setPreviewColor('#C65A2E');
        setScrollAttachments((current) => current.length ? [] : current);
        setScrollDecoration((current) => current.patternId ? { ...current, patternId: '' } : current);
      } else if (p < 0.75) {
        setScrollFinish('glazed');
        setPreviewColor('#FFFFFF');
        setScrollAttachments((current) => current.length ? [] : current);
        setScrollDecoration({
          patternId: 'traditional-curl',
          placement: 'full',
          scale: 1.1,
          color: '#315A9F',
          effect: 'engraved',
        });
      } else {
        setScrollFinish('glazed');
        setPreviewColor('#FFFFFF');
        setScrollDecoration({
          patternId: 'traditional-curl',
          placement: 'full',
          scale: 1.1,
          color: '#315A9F',
          effect: 'engraved',
        });
        setScrollAttachments((current) => current.length ? current : [FEATURED_ATTACHMENT]);
      }
    }
  });

  // Lazy-load freeform 3D model when section enters viewport
  useEffect(() => {
    const el = freeformSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setFreeformVisible(true);
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Fetch a default model for the preview
  useEffect(() => {
    if (!freeformVisible || previewModel) return;
    supabase.from('models_3d').select('file_url, name, category, thumbnail').eq('status', 'active').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.file_url) {
          setPreviewModel(data.file_url);
          setPreviewModelMeta({
            name: data.name,
            category: data.category,
            thumbnail: data.thumbnail || '',
          });
        } else {
          setPreviewModel('');
        }
      });
  }, [freeformVisible, previewModel]);

  function goToFreeform() {
    navigate('/freeform', {
      state: {
        modelUrl: previewModel,
        modelName: previewModelMeta?.name,
        modelCategory: previewModelMeta?.category,
        modelThumbnail: previewModelMeta?.thumbnail,
        color: previewColor,
      },
    });
  }

  // Animation Transforms — tuned for smooth 60fps fades
  // Softer spring for opacity (no overshoot, silky fade)
  const opacitySpring = { stiffness: 60, damping: 28, restDelta: 0.005 };
  // Slightly stiffer spring for position (responsive but no jitter)
  const positionSpring = { stiffness: 70, damping: 26, restDelta: 0.5 };

  const rawIntroOpacity = useTransform(scrollYProgress, [0, 0.08, 0.2, 0.28], [1, 1, 0.5, 0]);
  const introOpacity = useSpring(rawIntroOpacity, opacitySpring);
  
  const rawIntroY = useTransform(scrollYProgress, [0, 0.1, 0.25], [0, 0, -40]);
  const introY = useSpring(rawIntroY, positionSpring);
  
  const rawShapeOpacity = useTransform(scrollYProgress, [0.18, 0.28, 0.48, 0.58], [0, 1, 1, 0]);
  const shapeOpacity = useSpring(rawShapeOpacity, opacitySpring);
  
  const rawShapeY = useTransform(scrollYProgress, [0.2, 0.3, 0.5, 0.6], [40, 0, 0, -40]);
  const shapeY = useSpring(rawShapeY, positionSpring);
  
  const rawFinishOpacity = useTransform(scrollYProgress, [0.46, 0.56, 0.7, 0.78], [0, 1, 1, 0]);
  const finishOpacity = useSpring(rawFinishOpacity, opacitySpring);
  
  const rawFinishY = useTransform(scrollYProgress, [0.48, 0.58, 0.72], [40, 0, -40]);
  const finishY = useSpring(rawFinishY, positionSpring);

  const rawDecorOpacity = useTransform(scrollYProgress, [0.68, 0.76, 0.82, 0.88], [0, 1, 1, 0]);
  const decorOpacity = useSpring(rawDecorOpacity, opacitySpring);

  const rawDecorY = useTransform(scrollYProgress, [0.7, 0.78, 0.88], [40, 0, -40]);
  const decorY = useSpring(rawDecorY, positionSpring);

  const rawAttachmentOpacity = useTransform(scrollYProgress, [0.82, 0.9, 1], [0, 1, 1]);
  const attachmentOpacity = useSpring(rawAttachmentOpacity, opacitySpring);

  const rawAttachmentY = useTransform(scrollYProgress, [0.84, 0.92, 1], [40, 0, 0]);
  const attachmentY = useSpring(rawAttachmentY, positionSpring);

  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.05, 0.9, 1], [1, 0, 0, 0]);

  return (
    <motion.section 
      ref={freeformSectionRef} 
      style={{ backgroundColor: bgTransform, color: colorTransform }}
      className="relative"
    >
      <div className="h-[600vh]">
        {/* Sticky container */}
        <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col lg:flex-row max-w-[var(--container-width)] mx-auto">
          
          {/* Left: Animated Text Content */}
          <div className="freeform-landing-text-panel w-full lg:w-1/2 h-[38%] lg:h-full relative flex flex-col justify-center px-5 sm:px-6 lg:pl-12 z-10 pt-2 lg:pt-0">
            
            {/* Slide 1: Intro */}
            <motion.div 
              style={{ opacity: introOpacity, y: introY, willChange: 'opacity, transform' }}
              className="freeform-landing-intro-slide absolute inset-x-5 sm:inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2"
            >
              <h2 className="font-serif text-[2rem] sm:text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-3 sm:mb-5">
                Design Pottery.<br />
                <span className="text-[#823E0B]">Your Way.</span><br />
                In 3D.
              </h2>
              <p className="text-[0.85rem] sm:text-[1rem] leading-[1.6] sm:leading-[1.7] opacity-80 max-w-[460px]">
                Customize handcrafted pottery in real time using our interactive 3D Freeform Designer.
                Experiment with variations, dimensions, and decorative details before placing your order.
              </p>
            </motion.div>

            {/* Slide 2: Shape */}
            <motion.div 
              style={{ opacity: shapeOpacity, y: shapeY, willChange: 'opacity, transform' }}
              className="absolute inset-x-5 sm:inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <h2 className="font-serif text-[2rem] sm:text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-3 sm:mb-5">
                Shape <br />
                <span className="text-[#823E0B]">Your Vision.</span>
              </h2>
              <p className="text-[0.85rem] sm:text-[1rem] leading-[1.6] sm:leading-[1.7] opacity-80 max-w-[460px]">
                Mold the perfect piece. Adjust the height, widen the base, or refine the curves seamlessly—just like a master potter at the wheel.
              </p>
            </motion.div>

            {/* Slide 3: Finish */}
            <motion.div 
              style={{ opacity: finishOpacity, y: finishY, willChange: 'opacity, transform' }}
              className="absolute inset-x-5 sm:inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <h2 className="font-serif text-[2rem] sm:text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-3 sm:mb-5">
                Find Your <br />
                <span className="text-[#823E0B]">Perfect Finish.</span>
              </h2>
              <p className="text-[0.85rem] sm:text-[1rem] leading-[1.6] sm:leading-[1.7] opacity-80 max-w-[460px] mb-5 sm:mb-8">
                Choose from raw clay, elegant ceramic, or brilliant glazed finishes to perfectly match your aesthetic.
              </p>
            </motion.div>

            {/* Slide 4: Decor */}
            <motion.div
              style={{ opacity: decorOpacity, y: decorY, willChange: 'opacity, transform' }}
              className="absolute inset-x-5 sm:inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <h2 className="font-serif text-[2rem] sm:text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-3 sm:mb-5">
                Bring It <br />
                <span className="text-[#823E0B]">To Life.</span>
              </h2>
              <p className="text-[0.85rem] sm:text-[1rem] leading-[1.6] sm:leading-[1.7] opacity-80 max-w-[460px] mb-5 sm:mb-8">
                Add original patterns, choose where they wrap, and finish them painted or engraved for a piece with your own signature.
              </p>
            </motion.div>

            {/* Slide 5: 3D Attachments */}
            <motion.div
              style={{ opacity: attachmentOpacity, y: attachmentY, willChange: 'opacity, transform' }}
              className="absolute inset-x-5 sm:inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2 pointer-events-auto"
            >
              <h2 className="font-serif text-[2rem] sm:text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-3 sm:mb-5">
                Add The <br />
                <span className="text-[#A95A20]">Finishing Touch.</span>
              </h2>
              <p className="text-[0.85rem] sm:text-[1rem] leading-[1.6] sm:leading-[1.7] opacity-80 max-w-[460px] mb-5 sm:mb-8">
                Complete your piece with sculpted handles and dimensional accents. Preview every attachment directly on your pottery in real time.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={goToFreeform}
                  className="flex items-center gap-2.5 text-white font-semibold text-[0.85rem] sm:text-[0.95rem] py-3 sm:py-3.5 px-6 sm:px-8 rounded-[10px] transition-all bg-[#A95A20] shadow-[0_4px_16px_rgba(169,90,32,0.35)] hover:bg-[#8F4818] hover:scale-105 cursor-pointer"
                >
                  Start Designing Now
                </button>
              </div>
            </motion.div>

          </div>

          {/* Right: 3D Preview */}
          <div className="freeform-landing-preview-panel w-full lg:w-1/2 h-[62%] lg:h-full relative overflow-hidden flex items-center justify-center p-2 sm:p-4 lg:p-12">
            <div 
              className="w-full h-full max-h-[600px] rounded-[16px] sm:rounded-[24px] overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.1)] border border-[#E8E0D8]/20 relative"
              style={{ background: 'transparent' }}
            >
                {freeformVisible && previewModel ? (
                  <Suspense fallback={
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-2 border-[#D4C8BB] border-t-[#823E0B] rounded-full animate-spin" />
                        <span className="text-[0.82rem] opacity-70">Loading 3D preview...</span>
                      </div>
                    </div>
                  }>
                    <FreeformViewer
                      preview
                      modelFile={previewModel}
                      shapeParams={scrollShape}
                      materialParams={{ finish: scrollFinish, color: previewColor }}
                      decorationParams={scrollDecoration}
                      attachmentParams={scrollAttachments}
                      showAttachmentSockets={false}
                      onMorphDetected={() => {}}
                    />
                  </Suspense>
                ) : freeformVisible && previewModel === '' ? (
                  <div className="w-full h-full flex items-center justify-center p-6 text-center">
                    <p className="text-[0.85rem] opacity-70">Upload a 3D model in admin to enable the live preview.</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-[#D4C8BB] border-t-[#823E0B] rounded-full animate-spin" />
                      <span className="text-[0.82rem] opacity-70">Loading 3D preview...</span>
                    </div>
                  </div>
                )}
            </div>
              
            {/* Scroll Indicator */}
            <motion.div 
              style={{ opacity: scrollIndicatorOpacity }}
              className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
            >
              <span className="text-[0.6rem] sm:text-[0.7rem] uppercase tracking-widest font-semibold opacity-60">Scroll to explore</span>
              <div className="w-[1px] h-8 sm:h-12 bg-current opacity-30 relative overflow-hidden">
                <motion.div 
                  className="absolute top-0 left-0 w-full h-1/2 bg-current"
                  animate={{ y: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </motion.section>
  );
}
