import { useState } from 'react';
import ProfileAddressEditor from './ProfileAddressEditor';
import type { AccountProfileDraft } from './accountProfile';
import { emptyAddressParts } from '../../lib/profileAddress';
import type { SavedProfileAddress } from '../../lib/profileAddressBook';
import './ProfileAddressBook.css';

export default function ProfileAddressBook({draft,disabled,onSave}:{draft:AccountProfileDraft;disabled:boolean;onSave:(next:AccountProfileDraft)=>Promise<boolean>}) {
  const [editing,setEditing]=useState<{id:string;value:AccountProfileDraft;label:string}|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const addresses=draft.addresses||[];
  async function saveBook(next:SavedProfileAddress[],defaultId:string|null) {
    const active=next.find(item=>item.id===defaultId)||next[0];
    setBusy(true);setError('');
    try {
      const success=await onSave({...draft,addresses:next,defaultAddressId:active?.id||null,address:active?.address||'',addressParts:active?.addressParts??null,addressLat:active?.addressLat??null,addressLng:active?.addressLng??null});
      if(success)setEditing(null);
      else setError('Could not save the address. Review the profile errors and try again.');
    } finally {setBusy(false);}
  }
  function edit(item?:SavedProfileAddress) {
    setError('');
    setEditing({id:item?.id||crypto.randomUUID(),label:item?.label||'',value:{...draft,address:item?.address||'',addressParts:item?.addressParts??(item?null:emptyAddressParts()),addressLat:item?.addressLat??null,addressLng:item?.addressLng??null}});
  }
  async function saveAddress() {
    if(!editing)return;
    const value=editing.value;
    const parts=value.addressParts;
    if(value.address.trim().length<5 || parts && (!parts.region||!parts.city||!parts.barangay||!parts.street.trim())) {
      setError('Complete the region, city or municipality, barangay, and street or landmark before saving.');return;
    }
    const entry:SavedProfileAddress={id:editing.id,label:editing.label.trim()||'Address',address:value.address.trim(),addressParts:parts??null,addressLat:value.addressLat??null,addressLng:value.addressLng??null};
    const next=addresses.some(item=>item.id===entry.id)?addresses.map(item=>item.id===entry.id?entry:item):[...addresses,entry];
    await saveBook(next,draft.defaultAddressId||entry.id);
  }
  return <div className="profile-address-book">
    <p className="profile-address-help">Choose a default address for cart and checkout. Addresses without a delivery pin can still be used for pickup.</p>
    {!addresses.length&&!editing&&<p>No delivery addresses saved.</p>}
    <div className="profile-address-book__list">{addresses.map(item=><article className="profile-address-book__card" key={item.id}>
      <div><strong>{item.label}</strong>{item.id===draft.defaultAddressId&&<span className="profile-address-book__default">Default</span>}</div>
      <address>{item.address}</address>
      <small>{item.addressLat!==null&&item.addressLng!==null?'Delivery pin saved':'No delivery pin saved'}</small>
      <div className="profile-address-book__actions">
        <button type="button" className="account-button account-button--secondary" disabled={disabled||busy||Boolean(editing)} onClick={()=>edit(item)}>Edit {item.label}</button>
        {item.id!==draft.defaultAddressId&&<button type="button" className="account-button account-button--secondary" disabled={disabled||busy||Boolean(editing)} onClick={()=>void saveBook(addresses,item.id)}>Set {item.label} as default</button>}
        <button type="button" className="profile-clear-address" disabled={disabled||busy||Boolean(editing)} onClick={()=>void saveBook(addresses.filter(entry=>entry.id!==item.id),draft.defaultAddressId===item.id?addresses.find(entry=>entry.id!==item.id)?.id||null:draft.defaultAddressId||null)}>Remove {item.label}</button>
      </div>
    </article>)}</div>
    {!editing&&<button type="button" className="account-button account-button--secondary" disabled={disabled||busy} onClick={()=>edit()}>Add address</button>}
    {editing&&<section className="profile-address-book__form" aria-label="Address form">
      <label>Address label<input maxLength={50} placeholder="Home, work, family…" value={editing.label} disabled={disabled||busy} onChange={event=>setEditing({...editing,label:event.target.value})}/></label>
      <ProfileAddressEditor draft={editing.value} disabled={disabled||busy} onChange={value=>setEditing({...editing,value})}/>
      <div className="profile-address-book__actions"><button type="button" className="account-button account-button--primary" disabled={disabled||busy} onClick={()=>void saveAddress()}>{busy?'Saving address…':'Save address'}</button><button type="button" className="account-button account-button--secondary" disabled={disabled||busy} onClick={()=>{setEditing(null);setError('');}}>Cancel address</button></div>
    </section>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
