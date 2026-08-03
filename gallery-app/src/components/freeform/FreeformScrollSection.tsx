import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useMotionValueEvent, useSpring } from 'framer-motion';
import { supabase } from '../../lib/supabase';

const FreeformViewer = lazy(() => import('./FreeformViewer'));

interface FreeformScrollSectionProps {
  isMobile: boolean;
}

export default function FreeformScrollSection({ isMobile }: FreeformScrollSectionProps) {
  const navigate = useNavigate();
  
  // Freeform preview state
  const [previewModel, setPreviewModel] = useState<string | null>(null);
  const [previewModelMeta, setPreviewModelMeta] = useState<{ name: string; category: string; thumbnail: string } | null>(null);
  const freeformSectionRef = useRef<HTMLDivElement>(null);
  const [freeformVisible, setFreeformVisible] = useState(false);
  const [previewColor, setPreviewColor] = useState('#C4A882');

  // Framer motion scroll setup
  const { scrollYProgress } = useScroll({ target: freeformSectionRef, offset: ['start start', 'end end'] });
  const bgTransform = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], ['var(--bg-secondary)', '#1A1512', '#1A1512', 'var(--bg-secondary)']);
  const colorTransform = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], ['#2C1810', '#FDFDFB', '#FDFDFB', '#2C1810']);
  
  // Dynamic shape params
  const [scrollShape, setScrollShape] = useState({ height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 });
  const [scrollFinish, setScrollFinish] = useState('raw_clay');

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.3) {
      setScrollShape({ height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 });
      setScrollFinish('raw_clay');
      setPreviewColor('#C4A882');
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
      setPreviewColor('#C4A882');
    } else {
      setScrollShape({ height: 40, bodyWidth: 60, neckWidth: 10, rimSize: 20, curvature: 100 });
      const p = (latest - 0.6) / 0.4;
      if (p < 0.33) {
        setScrollFinish('glazed');
        setPreviewColor('#A0522D');
      } else if (p < 0.66) {
        setScrollFinish('ceramic');
        setPreviewColor('#4682B4'); // Steel Blue
      } else {
        setScrollFinish('metallic');
        setPreviewColor('#C0C0C0'); // Silver/Metallic
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
    supabase.from('models_3d').select('file_url, name, category, thumbnail').limit(1).maybeSingle()
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

  // Animation Transforms
  const springConfig = { stiffness: 100, damping: 30, restDelta: 0.001 };

  const rawIntroOpacity = useTransform(scrollYProgress, [0, 0.1, 0.25], [1, 1, 0]);
  const introOpacity = useSpring(rawIntroOpacity, springConfig);
  
  const rawIntroY = useTransform(scrollYProgress, [0, 0.1, 0.25], [0, 0, -50]);
  const introY = useSpring(rawIntroY, springConfig);
  
  const rawShapeOpacity = useTransform(scrollYProgress, [0.2, 0.3, 0.5, 0.6], [0, 1, 1, 0]);
  const shapeOpacity = useSpring(rawShapeOpacity, springConfig);
  
  const rawShapeY = useTransform(scrollYProgress, [0.2, 0.3, 0.5, 0.6], [50, 0, 0, -50]);
  const shapeY = useSpring(rawShapeY, springConfig);
  
  const rawFinishOpacity = useTransform(scrollYProgress, [0.5, 0.6, 0.95], [0, 1, 1]);
  const finishOpacity = useSpring(rawFinishOpacity, springConfig);
  
  const rawFinishY = useTransform(scrollYProgress, [0.5, 0.6, 0.95], [50, 0, 0]);
  const finishY = useSpring(rawFinishY, springConfig);

  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.05, 0.9, 1], [1, 0, 0, 0]);

  return (
    <motion.section 
      ref={freeformSectionRef} 
      style={{ backgroundColor: bgTransform, color: colorTransform }}
      className="relative"
    >
      <div className="h-[400vh]">
        {/* Sticky container */}
        <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col lg:flex-row max-w-[var(--container-width)] mx-auto">
          
          {/* Left: Animated Text Content */}
          <div className="w-full lg:w-1/2 h-1/2 lg:h-full relative flex flex-col justify-center px-6 lg:pl-12 z-10">
            
            {/* Slide 1: Intro */}
            <motion.div 
              style={{ opacity: introOpacity, y: introY }}
              className="absolute inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2"
            >
              <h2 className="font-serif text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-5">
                Design Pottery.<br />
                <span className="text-[#823E0B]">Your Way.</span><br />
                In 3D.
              </h2>
              <p className="text-[1rem] leading-[1.7] opacity-80 max-w-[460px]">
                Customize handcrafted pottery in real time using our interactive 3D Freeform Designer.
                Experiment with variations, dimensions, and decorative details before placing your order.
              </p>
              
              {isMobile && (
                <p className="text-[0.85rem] font-medium mt-4 text-[#8A7A6E]">
                  (Available for Desktop Only)
                </p>
              )}
            </motion.div>

            {/* Slide 2: Shape */}
            <motion.div 
              style={{ opacity: shapeOpacity, y: shapeY }}
              className="absolute inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <h2 className="font-serif text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-5">
                Shape <br />
                <span className="text-[#823E0B]">Your Vision.</span>
              </h2>
              <p className="text-[1rem] leading-[1.7] opacity-80 max-w-[460px]">
                Mold the perfect piece. Adjust the height, widen the base, or refine the curves seamlessly—just like a master potter at the wheel.
              </p>
            </motion.div>

            {/* Slide 3: Finish */}
            <motion.div 
              style={{ opacity: finishOpacity, y: finishY }}
              className="absolute inset-x-6 lg:inset-x-12 top-1/2 -translate-y-1/2 pointer-events-auto"
            >
              <h2 className="font-serif text-[2.5rem] lg:text-[3.2rem] leading-[1.15] font-bold mb-5">
                Bring It <br />
                <span className="text-[#823E0B]">To Life.</span>
              </h2>
              <p className="text-[1rem] leading-[1.7] opacity-80 max-w-[460px] mb-8">
                Choose from raw clay, elegant ceramic, or brilliant glazed finishes to perfectly match your aesthetic.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={isMobile ? undefined : goToFreeform}
                  disabled={isMobile}
                  className={`flex items-center gap-2.5 text-white font-semibold text-[0.95rem] py-3.5 px-8 rounded-[10px] transition-all ${isMobile ? 'bg-[#B9A79A] cursor-not-allowed opacity-70' : 'bg-[#823E0B] shadow-[0_4px_16px_rgba(130,62,11,0.35)] hover:bg-[#6B3209] hover:scale-105 cursor-pointer'}`}
                >
                  Start Designing Now
                </button>
              </div>
            </motion.div>

          </div>

          {/* Right: 3D Preview */}
          <div className="w-full lg:w-1/2 h-1/2 lg:h-full relative overflow-hidden flex items-center justify-center p-6 lg:p-12">
            <div 
              className="w-full h-full max-h-[600px] rounded-[24px] overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.1)] border border-[#E8E0D8]/20 relative"
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
                      previewMode
                      modelFile={previewModel}
                      shapeParams={scrollShape}
                      materialParams={{ finish: scrollFinish, color: previewColor }}
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
              className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
            >
              <span className="text-[0.7rem] uppercase tracking-widest font-semibold opacity-60">Scroll to explore</span>
              <div className="w-[1px] h-12 bg-current opacity-30 relative overflow-hidden">
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
