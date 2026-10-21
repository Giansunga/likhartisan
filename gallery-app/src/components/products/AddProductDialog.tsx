import { useId, useState } from 'react';
import { Box, Info, PackagePlus, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popup } from '../Popup';
import type { ProductCreationPaths } from './productCreationPaths';
import './product-creation.css';

export default function AddProductDialog({ paths, onClose }: { paths: ProductCreationPaths; onClose: () => void }) {
  const [method, setMethod] = useState<'create' | 'upload'>('create');
  const name = useId();
  const navigate = useNavigate();
  return <Popup title="Add New Product" message="Choose how you'd like to add your product:" icon={<PackagePlus size={25} />} showClose className="add-product-popup" confirmLabel={method === 'create' ? 'View 3D tools' : 'Continue to product form'} onCancel={onClose} onConfirm={() => { onClose(); navigate(method === 'create' ? paths.tools : paths.create); }}>
    <fieldset className="add-product-options">
      <legend className="sr-only">Product creation method</legend>
      <label className={`add-product-option${method === 'create' ? ' is-selected' : ''}`}>
        <input type="radio" name={name} value="create" checked={method === 'create'} onChange={() => setMethod('create')} />
        <span className="add-product-option__copy"><strong>Create 3D Model</strong><span className="add-product-badge">External AI</span><small>Turn product photos into a 3D model using an external tool, then upload the downloaded file.</small></span><Box aria-hidden="true" />
      </label>
      <label className={`add-product-option${method === 'upload' ? ' is-selected' : ''}`}>
        <input type="radio" name={name} value="upload" checked={method === 'upload'} onChange={() => setMethod('upload')} />
        <span className="add-product-option__copy"><strong>Upload Existing Product</strong><span className="add-product-badge">Direct Import</span><small>Add product details, inventory, photos, and an existing .glb model.</small></span><Upload aria-hidden="true" />
      </label>
    </fieldset>
    <p className="add-product-note"><Info size={15} aria-hidden="true" /> Supports .glb models and product tags.</p>
  </Popup>;
}
