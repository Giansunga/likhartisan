import { useState, type ImgHTMLAttributes } from 'react';
import { resolveAssetUrl } from '../lib/assetDelivery';

/** A local fallback prevents cascading requests when the source cannot be reached. */
export default function AssetImage({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <ImageSource key={src} src={src} onError={onError} {...props} />;
}

function ImageSource({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  return <img {...props} src={failed || !src ? '/images/media-unavailable.svg' : resolveAssetUrl(src)} onError={event => {
    if (!failed) { setFailed(true); onError?.(event); }
  }} />;
}
