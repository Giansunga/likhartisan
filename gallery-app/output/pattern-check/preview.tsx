import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FreeformViewer from '../../src/components/freeform/FreeformViewer';
import models from './catalog.json';
const noop = () => { console.log('Model mounted'); };
function App() {
  const [page, setPage] = useState(0);
  const [shaped, setShaped] = useState(false);
  const [top, setTop] = useState(false);
  return <main style={{fontFamily:'sans-serif'}}><header style={{height:48,display:'flex',gap:16,alignItems:'center'}}>
    <b>Pattern catalog verification</b><select aria-label="Model group" value={page} onChange={e=>setPage(Number(e.target.value))}>{[0,1,2,3].map(p=><option key={p} value={p}>Group {p+1}</option>)}</select>
    <label>Shape <select aria-label="Shape" value={Number(shaped)} onChange={e=>setShaped(e.target.value === "1")}><option value="0">Original</option><option value="1">Edited</option></select></label>
    <label>View <select aria-label="View" value={Number(top)} onChange={e=>setTop(e.target.value === "1")}><option value="0">Side</option><option value="1">Interior</option></select></label>
  </header><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>{models.slice(page*4,page*4+4).map(model=><section key={`${model.id}-${top}`}><b>{model.name}</b><div style={{height:320}}><FreeformViewer
    modelFile={`/output/pattern-check/${model.id}.glb`}
    shapeParams={{height:shaped?30:25,bodyWidth:shaped?24:20,neckWidth:15,rimSize:12,curvature:50}}
    materialParams={{finish:'raw_clay',color:'#BE734F'}}
    decorationParams={{patternId:'floral-sampaguita',placement:'full',scale:1,color:'#315A9F',effect:'painted'}}
    onMorphDetected={noop} pauseAttachmentAnalysis showAttachmentSockets={false}
    onControlsReady={top ? (controls,camera)=>{const distance=camera.position.length();camera.position.set(0,distance*0.9,distance*0.3);camera.lookAt(0,0,0);controls?.update?.();}:undefined}
  /></div></section>)}</div></main>;
}
import { useLoader } from '@react-three/fiber';
models.forEach(m => useLoader.preload(GLTFLoader, '/output/pattern-check/'+m.id+'.glb'));
setTimeout(() => createRoot(document.getElementById('root')!).render(<App/>), 2000);

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
new GLTFLoader().load('/output/pattern-check/'+models[0].id+'.glb',()=>console.log('GLB complete'),undefined,e=>console.error('GLB failed',e));
