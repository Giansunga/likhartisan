import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ProductTable from '../../components/admin/ProductTable';
import type { Product } from '../../types';
import { mapSupabaseProduct } from '../../lib/utils';
import { recomputeProductStock } from '../../lib/stockSync';

const categories = ['Vases', 'Bowls', 'Jars', 'Teapots', 'Planters', 'Amphoras', 'Plates'];

export default function ProductListPage() {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: '', category: '',
    materials: '', technique: '',
  });
  const [variations, setVariations] = useState<{ id?: string; dimensions: string; height: string; openingDiameter: string; price: string; stock: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = data.map((p: any) => mapSupabaseProduct(p));

      const ids = mapped.map(p => p.id);
      if (ids.length > 0) {
        const { data: varRows } = await supabase
          .from('product_variations')
          .select('product_id, price')
          .in('product_id', ids);

        if (varRows && varRows.length > 0) {
          const lowest: Record<string, number> = {};
          for (const v of varRows) {
            if (v.price && (!lowest[v.product_id] || v.price < lowest[v.product_id])) {
              lowest[v.product_id] = v.price;
            }
          }
          mapped.forEach(p => {
            if (lowest[p.id]) p.price = lowest[p.id];
          });
        }
      }

      setProductsList(mapped);
    }
    setLoading(false);
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this product?')) {
      await supabase.from('products').delete().eq('id', id);
      fetchProducts();
    }
  };

  const handleArchive = async (id: string) => {
    const product = productsList.find(p => p.id === id);
    if (!product) return;
    const newStatus = product.status === 'archived' ? 'active' : 'archived';
    await supabase.from('products').update({ status: newStatus }).eq('id', id);
    fetchProducts();
  };

  async function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name || '',
      category: p.category || '',
      materials: p.materials || '',
      technique: p.technique || '',
    });
    const { data } = await supabase
      .from('product_variations')
      .select('*')
      .eq('product_id', p.id)
      .order('sort_order');
    if (data) {
      setVariations(data.map((v: any) => ({
        id: v.id, dimensions: v.dimensions, height: v.height, openingDiameter: v.opening_diameter,
        price: v.price != null ? String(v.price) : '', stock: String(v.stock),
      })));
    } else {
      setVariations([]);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from('products')
      .update({
        name: form.name,
        category: form.category,
        materials: form.materials,
        technique: form.technique,
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) { alert('Failed to save: ' + error.message); return; }

    for (const v of variations) {
      if (!v.dimensions.trim() && !v.height.trim() && !v.openingDiameter.trim()) continue;
      if (v.id) {
        await supabase.from('product_variations').update({
          dimensions: v.dimensions.trim() || 'N/A',
          height: v.height.trim() || 'N/A',
          opening_diameter: v.openingDiameter.trim() || 'N/A',
          price: v.price ? Number(v.price) : null, stock: Number(v.stock) || 0,
        }).eq('id', v.id);
      } else {
        await supabase.from('product_variations').insert({
          product_id: editing.id,
          dimensions: v.dimensions.trim() || 'N/A',
          height: v.height.trim() || 'N/A',
          opening_diameter: v.openingDiameter.trim() || 'N/A',
          price: v.price ? Number(v.price) : null, stock: Number(v.stock) || 0,
          sort_order: variations.indexOf(v),
        });
      }
    }

    const existingIds = variations.filter(v => v.id).map(v => v.id);
    if (existingIds.length > 0) {
      await supabase.from('product_variations').delete()
        .eq('product_id', editing.id)
        .not('id', 'in', `(${existingIds.join(',')})`);
    } else {
      await supabase.from('product_variations').delete().eq('product_id', editing.id);
    }

    // Recompute product-level stock from variations
    const newTotalStock = await recomputeProductStock(editing.id);

    setProductsList(prev => prev.map(p => p.id === editing.id ? {
      ...p,
      name: form.name,
      category: form.category,
      materials: form.materials,
      technique: form.technique,
      stock: newTotalStock,
      inStock: newTotalStock > 0,
    } : p));
    setEditing(null);
  }

  function addVariation() {
    setVariations(prev => [...prev, { dimensions: '', height: '', openingDiameter: '', price: '', stock: '' }]);
  }

  function updateVariation(index: number, field: string, value: string) {
    setVariations(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function removeVariation(index: number) {
    setVariations(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-brown-dark">Product Management</h2>
          <p className="text-sm text-brown-medium mt-1">Manage all pottery listings</p>
        </div>
        <Link
          to="/admin/products/create"
          className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors flex items-center gap-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Upload 3D Product
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-brown-medium">Loading products...</div>
      ) : (
        <ProductTable
          products={productsList}
          onDelete={handleDelete}
          onArchive={handleArchive}
          onEdit={openEdit}
        />
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }} onClick={() => setEditing(null)}>
          <div style={{
            background: '#fff', borderRadius: '16px', width: '900px', maxWidth: '100%',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '24px 32px', borderBottom: '1px solid #E8E0D8', flexShrink: 0,
            }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2C1810', margin: 0 }}>Edit Product</h2>
                <p style={{ fontSize: '0.82rem', color: '#8C7B6E', margin: '4px 0 0' }}>{editing.name}</p>
              </div>
              <button onClick={() => setEditing(null)} style={{
                width: '36px', height: '36px', borderRadius: '10px', border: '1.5px solid #E8E0D8',
                background: '#fff', fontSize: '1.2rem', cursor: 'pointer', color: '#8C7B6E',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.color = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.color = '#8C7B6E'; e.currentTarget.style.background = '#fff'; }}
              >&#x2715;</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

              {/* Section: Product Specifications */}
              <div style={{ marginBottom: '28px' }}>
                <h3 style={{
                  fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: '16px', paddingBottom: '10px',
                  borderBottom: '1px solid #F0EBE5',
                }}>Product Specifications</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px' }}>Product Name</label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      style={{
                        width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
                        fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px' }}>Category</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                      style={{
                        width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
                        fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
                        outline: 'none', cursor: 'pointer',
                      }}>
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px' }}>Material</label>
                    <input type="text" value={form.materials} onChange={e => setForm({ ...form, materials: e.target.value })} placeholder="e.g. Terracotta Clay"
                      style={{
                        width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
                        fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px' }}>Technique</label>
                    <input type="text" value={form.technique} onChange={e => setForm({ ...form, technique: e.target.value })} placeholder="e.g. Handcrafted &amp; Kiln-Fired"
                      style={{
                        width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
                        fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                    />
                  </div>
                </div>
              </div>

              {/* Section: Variations */}
              <div>
                <h3 style={{
                  fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: '16px', paddingBottom: '10px',
                  borderBottom: '1px solid #F0EBE5',
                }}>Variations                </h3>

                {/* Total Stock Summary */}
                {variations.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
                    padding: '10px 14px', borderRadius: '10px', background: '#F0EBE4',
                  }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E' }}>Total Stock:</span>
                    <span style={{
                      fontSize: '0.95rem', fontWeight: 700,
                      color: variations.reduce((s, v) => s + (Number(v.stock) || 0), 0) === 0 ? '#d32f2f' :
                             variations.reduce((s, v) => s + (Number(v.stock) || 0), 0) <= 3 ? '#E67E22' : '#823E0B',
                    }}>
                      {variations.reduce((s, v) => s + (Number(v.stock) || 0), 0)}
                    </span>
                    {variations.reduce((s, v) => s + (Number(v.stock) || 0), 0) === 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#d32f2f', fontWeight: 600 }}>(Out of Stock)</span>
                    )}
                  </div>
                )}

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
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Dimensions</label>
                            <input value={v.dimensions} onChange={e => updateVariation(i, 'dimensions', e.target.value)} placeholder="e.g. 15cm x 10cm"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Height</label>
                            <input value={v.height} onChange={e => updateVariation(i, 'height', e.target.value)} placeholder="e.g. 20cm"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Opening Diameter</label>
                            <input value={v.openingDiameter} onChange={e => updateVariation(i, 'openingDiameter', e.target.value)} placeholder="e.g. 8cm"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Price</label>
                            <input type="number" value={v.price} onChange={e => updateVariation(i, 'price', e.target.value)} placeholder="0.00"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Stock</label>
                            <input type="number" value={v.stock} onChange={e => updateVariation(i, 'stock', e.target.value)} placeholder="0"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
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
            </div>

            {/* Sticky Footer */}
            <div style={{
              display: 'flex', gap: '12px', justifyContent: 'flex-end', padding: '16px 32px',
              borderTop: '1px solid #E8E0D8', background: '#fff', flexShrink: 0,
              borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px',
            }}>
              <button onClick={() => setEditing(null)} style={{
                padding: '11px 24px', border: '1.5px solid #D4C8BB', borderRadius: '10px',
                background: '#fff', color: '#5A4A3E', fontSize: '0.88rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.color = '#823E0B'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.color = '#5A4A3E'; }}
              >Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{
                padding: '11px 28px', border: 'none', borderRadius: '10px',
                background: saving ? '#B8A89A' : '#823E0B', color: '#fff', fontSize: '0.88rem', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                boxShadow: saving ? 'none' : '0 2px 8px rgba(130,62,11,0.25)',
              }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#6B3209'; }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#823E0B'; }}
              >{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
