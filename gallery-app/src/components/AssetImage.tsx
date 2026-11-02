import { useState, type ImgHTMLAttributes } from 'react';
import { resolveAssetUrl } from '../lib/assetDelivery';

/** A local fallback prevents cascading requests when the source cannot be reached. */
export default function AssetImage({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <ImageSource key={src} src={src} onError={onError} {...props} />;
}

function ImageSource({ src, srcSet, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  const source = src?.trim();
  const showFallback = failed || !source;
  return <img {...props} srcSet={showFallback ? undefined : srcSet} src={showFallback ? '/images/media-unavailable.svg' : resolveAssetUrl(source)} onError={event => {
    if (!failed) { setFailed(true); onError?.(event); }
  }} />;
}
