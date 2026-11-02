import AssetImage from '../AssetImage';

export default function ModelThumb({ thumbnail, size = 48 }: { thumbnail?: string; size?: number }) {
  return <AssetImage
    src={thumbnail}
    alt=""
    style={{ width: size, height: size, objectFit: 'cover', borderRadius: size > 40 ? 12 : 10 }}
  />;
}
