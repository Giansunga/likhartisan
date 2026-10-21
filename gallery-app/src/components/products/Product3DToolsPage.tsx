import { ArrowLeft, ArrowRight, ExternalLink, Info, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ProductCreationPaths } from './productCreationPaths';
import './product-creation.css';
const tools = [
  { name: 'Meshy', url: 'https://www.meshy.ai/' },
  { name: 'Tripo3D', url: 'https://www.tripo3d.ai/' },
  { name: 'Hi3D', url: 'https://hi3d.pro/' },
  { name: 'Rodin', url: 'https://hyper3d.ai/' },
];
export default function Product3DToolsPage({ paths }: { paths: ProductCreationPaths }) {
  return <div className="product-tools-page">
    <nav className="product-creation-bar" aria-label="Product creation"><Link to={paths.list}><ArrowLeft size={16} /> Products</Link><span>/ Convert Images to 3D</span><Link to={paths.list} className="product-creation-cancel"><X size={15} /> Cancel</Link></nav>
    <section className="product-tools-card" aria-labelledby="product-tools-title">
      <div className="product-tools-heading"><h1 id="product-tools-title">Convert Images to 3D</h1></div>
      <p className="product-tools-intro">Use an external tool to generate a .glb 3D model from your product photos, then return here to upload it.</p>
      <ul className="product-tools-list">{tools.map(tool => <li key={tool.name}><strong>{tool.name}</strong><span className="add-product-badge">External AI</span><a href={tool.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${tool.name} (opens in a new tab)`}>Visit <ExternalLink size={13} aria-hidden="true" /></a></li>)}</ul>
      <section className="product-tools-instructions" aria-labelledby="product-tools-instructions-title"><h2 id="product-tools-instructions-title"><Info size={16} aria-hidden="true" /> How to add your model</h2><ol><li><span>1</span><p>Generate your model externally and download it in <strong>.glb format</strong>.</p></li><li><span>2</span><p>Continue to the product form below, add your details, and choose your downloaded file.</p></li></ol><p className="product-tools-limits">Product images: up to 5 MB · .glb models: up to 25 MB</p></section>
      <footer className="product-tools-footer"><Link to={paths.list}>Back to products</Link><Link className="product-creation-primary" to={paths.create}>Continue to product form <ArrowRight size={16} /></Link></footer>
    </section>
  </div>;
}
