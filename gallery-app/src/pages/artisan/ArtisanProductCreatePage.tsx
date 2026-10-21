import { toast } from '../../lib/popups';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ProductCreateForm from '../../components/products/ProductCreateForm';
import { useArtisanPortal } from '../../components/artisan/artisanContextValue';
import { ARTISAN_PRODUCT_PATHS } from '../../components/products/productCreationPaths';
export default function ArtisanProductCreatePage() {
  const { shop, refreshProducts } = useArtisanPortal();
  return <div className="seller-route-page"><div className="artisan-product-create"><div className="product-creation-heading"><div><h1>Add Product</h1><p>Add a product to {shop.name}.</p></div><Link to={ARTISAN_PRODUCT_PATHS.list}><ArrowLeft size={16} /> Back to listings</Link></div><ProductCreateForm key={shop.id} lockedShop={shop} listPath={ARTISAN_PRODUCT_PATHS.list} onCreated={async () => { try { await refreshProducts(); } catch { toast.error('Product created. Refresh listings to see the latest products.'); } }} /></div></div>;
}
