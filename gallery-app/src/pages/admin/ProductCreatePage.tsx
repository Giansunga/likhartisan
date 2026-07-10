import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const categories = ['Vases', 'Bowls', 'Jars', 'Teapots', 'Planters', 'Amphoras', 'Plates'];

interface Shop {
  id: string;
  name: string;
  email: string;
}

interface VariationDraft {
  dimensions: string;
  height: string;
  openingDiameter: string;
  price: string;
  stock: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
  fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
  outline: 'none', transition: 'border-color 0.15s',
};

const inputFocusProps = {
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#823E0B'; },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#E8E0D8'; },
};

const varInputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
  fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
  outline: 'none', transition: 'border-color 0.15s',
};

const varInputFocusProps = {
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#823E0B'; },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#E8E0D8'; },
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: '16px', paddingBottom: '10px',
  borderBottom: '1px solid #F0EBE5',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px',
};

const varLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px',
};

export default function ProductCreatePage() {
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState({
    name: '', category: '',
    materials: '', technique: '', shopId: '',
  });
  const [variations, setVariations] = useState<VariationDraft[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchShops();
  }, []);

  async function fetchShops() {
    const { data } = await supabase
      .from('shops')
      .select('id, name, email')
      .order('name');

    if (data) {
      setShops(data);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleGlbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGlbFile(file);
    }
  };

  function addVariation() {
    setVariations(prev => [...prev, { dimensions: '', height: '', openingDiameter: '', price: '', stock: '' }]);
  }

  function updateVariation(index: number, field: keyof VariationDraft, value: string) {
    setVariations(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function removeVariation(index: number) {
    setVariations(prev => prev.filter((_, i) => i !== index));
  }

  async function uploadFile(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('products')
      .upload(fileName, file);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('products')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const shop = shops.find(s => s.id === form.shopId);
    if (!shop) return;

    setLoading(true);

    let imageUrl = '/placeholder.svg';
    if (imageFile) {
      const uploadedUrl = await uploadFile(imageFile);
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    let model3dUrl: string | null = null;
    if (glbFile) {
      model3dUrl = await uploadFile(glbFile);
    }

    const { data: productData, error } = await supabase
      .from('products')
      .insert({
        name: form.name,
        description: '',
        category: form.category,
        price: 0,
        stock: 0,
        image: imageUrl,
        model3d: model3dUrl,
        materials: form.materials,
        dimensions: '',
        height: '',
        opening_diameter: '',
        technique: form.technique || 'Handcrafted & Kiln-Fired',
        shop_id: form.shopId,
        shop_name: shop.name,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving product:', error);
      setLoading(false);
      return;
    }

    if (productData && variations.length > 0) {
      const variationRows = variations
        .filter(v => v.dimensions.trim() || v.height.trim() || v.openingDiameter.trim())
        .map((v, i) => ({
          product_id: productData.id,
          dimensions: v.dimensions.trim() || 'N/A',
          height: v.height.trim() || 'N/A',
          opening_diameter: v.openingDiameter.trim() || 'N/A',
          price: v.price ? Number(v.price) : null,
          stock: Number(v.stock) || 0,
          sort_order: i,
        }));
      if (variationRows.length > 0) {
        await supabase.from('product_variations').insert(variationRows);
      }
    }

    setLoading(false);
    setSubmitted(true);
    setTimeout(() => navigate('/admin/products'), 1500);
  };

  const isValid = form.name && form.category && form.shopId;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>

      {submitted ? (
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '48px', textAlign: 'center',
          border: '1px solid #E8E0D8', boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2" style={{ width: '48px', height: '48px', margin: '0 auto 16px' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#2E7D32', margin: '0 0 8px' }}>Product Uploaded!</h3>
          <p style={{ fontSize: '0.88rem', color: '#5A7D3A' }}>Redirecting to product list...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>

          {/* Header */}
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#2C1810', margin: '0 0 4px' }}>Upload New 3D Product</h2>
            <p style={{ fontSize: '0.85rem', color: '#8C7B6E', margin: 0 }}>Assign a pottery product to an artisan shop</p>
          </div>

          {/* Section: Product Information */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', padding: '28px 32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 style={sectionHeaderStyle}>Product Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Product Name</label>
                <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Ancient Vase"
                  style={inputStyle} {...inputFocusProps} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select name="category" value={form.category} onChange={handleChange} required
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' as any }}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Material</label>
                <input name="materials" value={form.materials} onChange={handleChange} placeholder="e.g. Terracotta Clay"
                  style={inputStyle} {...inputFocusProps} />
              </div>
              <div>
                <label style={labelStyle}>Technique</label>
                <input name="technique" value={form.technique} onChange={handleChange} placeholder="e.g. Handcrafted &amp; Kiln-Fired"
                  style={inputStyle} {...inputFocusProps} />
              </div>
              <div>
                <label style={labelStyle}>Assign to Shop</label>
                <select name="shopId" value={form.shopId} onChange={handleChange} required
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' as any }}>
                  <option value="">Select artisan shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {shops.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#823E0B', marginTop: '6px' }}>No shops registered yet. Create a shop first.</p>
                )}
              </div>
            </div>
          </div>

          {/* Section: Variations */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', padding: '28px 32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 style={sectionHeaderStyle}>Variations</h3>

            {variations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                {variations.map((v, i) => (
                  <div key={i} style={{
                    border: '1.5px solid #E8E0D8', borderRadius: '12px', padding: '16px',
                    background: '#FAF8F5', position: 'relative',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, color: '#823E0B', textTransform: 'uppercase',
                        letterSpacing: '0.06em', background: 'rgba(130,62,11,0.08)', padding: '3px 10px',
                        borderRadius: '6px',
                      }}>Variation {i + 1}</span>
                      <button type="button" onClick={() => removeVariation(i)} style={{
                        background: 'none', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                        color: '#d32f2f', cursor: 'pointer', padding: '5px 12px', fontSize: '0.78rem',
                        fontWeight: 600, transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.background = 'none'; }}
                      >Remove</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={varLabelStyle}>Dimensions</label>
                        <input value={v.dimensions} onChange={e => updateVariation(i, 'dimensions', e.target.value)} placeholder="e.g. 15cm x 10cm"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Height</label>
                        <input value={v.height} onChange={e => updateVariation(i, 'height', e.target.value)} placeholder="e.g. 20cm"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Opening Diameter</label>
                        <input value={v.openingDiameter} onChange={e => updateVariation(i, 'openingDiameter', e.target.value)} placeholder="e.g. 8cm"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <div>
                        <label style={varLabelStyle}>Price</label>
                        <input type="number" value={v.price} onChange={e => updateVariation(i, 'price', e.target.value)} placeholder="0.00"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Stock</label>
                        <input type="number" value={v.stock} onChange={e => updateVariation(i, 'stock', e.target.value)} placeholder="0"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#B8A89A', marginBottom: '16px' }}>No variations added yet. Add a variation below.</p>
            )}

            <button type="button" onClick={addVariation} style={{
              width: '100%', padding: '12px', border: '2px dashed #D4C8BB', borderRadius: '10px',
              background: 'transparent', color: '#823E0B', fontWeight: 600, fontSize: '0.88rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add New Variation
            </button>
          </div>

          {/* Section: Media Upload */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', padding: '28px 32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 style={sectionHeaderStyle}>Media Upload</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={labelStyle}>Product Image</label>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '24px', border: '2px dashed #D4C8BB', borderRadius: '12px', cursor: 'pointer',
                  background: '#FAF8F5', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = '#FAF8F5'; }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#8C7B6E" strokeWidth="1.5" style={{ width: '32px', height: '32px', marginBottom: '8px' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#823E0B' }}>
                    {imageFile ? imageFile.name : 'Choose Image'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#B8A89A', marginTop: '4px' }}>JPG, PNG up to 5MB</span>
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                {imagePreview && <img src={imagePreview} alt="Preview" style={{ marginTop: '12px', width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover' }} />}
              </div>
              <div>
                <label style={labelStyle}>3D Model (.glb)</label>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '24px', border: '2px dashed #D4C8BB', borderRadius: '12px', cursor: 'pointer',
                  background: '#FAF8F5', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = '#FAF8F5'; }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#8C7B6E" strokeWidth="1.5" style={{ width: '32px', height: '32px', marginBottom: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#823E0B' }}>
                    {glbFile ? glbFile.name : 'Choose 3D Model'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#B8A89A', marginTop: '4px' }}>GLB format only</span>
                  <input type="file" accept=".glb" onChange={handleGlbChange} style={{ display: 'none' }} />
                </label>
                {glbFile && (
                  <div style={{
                    marginTop: '12px', padding: '10px 14px', background: 'rgba(130,62,11,0.06)',
                    borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#823E0B" strokeWidth="2" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span style={{ fontSize: '0.78rem', color: '#823E0B', fontWeight: 500 }}>{glbFile.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => navigate('/admin/products')} style={{
              padding: '11px 24px', border: '1.5px solid #D4C8BB', borderRadius: '10px',
              background: '#fff', color: '#5A4A3E', fontSize: '0.88rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.color = '#823E0B'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.color = '#5A4A3E'; }}
            >Cancel</button>
            <button type="submit" disabled={!isValid || loading} style={{
              padding: '11px 28px', border: 'none', borderRadius: '10px',
              background: !isValid || loading ? '#B8A89A' : '#823E0B', color: '#fff', fontSize: '0.88rem', fontWeight: 600,
              cursor: !isValid || loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              boxShadow: !isValid || loading ? 'none' : '0 2px 8px rgba(130,62,11,0.25)',
            }}
              onMouseEnter={e => { if (isValid && !loading) e.currentTarget.style.background = '#6B3209'; }}
              onMouseLeave={e => { if (isValid && !loading) e.currentTarget.style.background = '#823E0B'; }}
            >{loading ? 'Uploading...' : 'Upload Product'}</button>
          </div>

        </form>
      )}
    </div>
  );
}
