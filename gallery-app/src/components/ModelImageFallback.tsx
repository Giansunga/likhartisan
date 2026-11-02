import AssetImage from './AssetImage';
import './model-loading.css';

/** A static photo preview; it never replaces the stored model or design. */
export default function ModelImageFallback({ src, alt = 'Model preview' }: { src?: string; alt?: string }) {
  return <div className="model-image-fallback">
    <AssetImage src={src} alt={alt} />
  </div>;
}
