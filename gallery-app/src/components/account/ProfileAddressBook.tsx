import { useState } from 'react';
import { BriefcaseBusiness, CircleCheck, House, MapPin, Plus, Trash2 } from 'lucide-react';
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
  const displayedAddresses=[...addresses].sort((a,b)=>Number(b.id===draft.defaultAddressId)-Number(a.id===draft.defaultAddressId));
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
    <div className="profile-address-book__heading">
      <div className="account-card__heading">
        <span><MapPin size={20} aria-hidden="true" /></span>
        <div><h2 id="account-address-title">Delivery addresses</h2><p>Manage your saved addresses and choose a default for checkout.</p></div>
      </div>
      {!editing&&<button type="button" className="account-button account-button--primary" disabled={disabled||busy} onClick={()=>edit()}><Plus size={16} aria-hidden="true"/>Add address</button>}
    </div>
    {!addresses.length&&!editing&&<p>No delivery addresses saved.</p>}
    <div className="profile-address-book__list">{displayedAddresses.map(item=><article className={`profile-address-book__card${item.id===draft.defaultAddressId?' profile-address-book__card--default':''}`} key={item.id}>
      <div className="profile-address-book__identity"><span className="profile-address-book__icon">{item.label.toLowerCase()==='work'?<BriefcaseBusiness size={22} aria-hidden="true"/>:<House size={22} aria-hidden="true"/>}</span><div><strong>{item.label}</strong>{item.id===draft.defaultAddressId&&<span className="profile-address-book__default">Default</span>}</div></div>
      <div className="profile-address-book__details"><address>{item.address}</address>
      <small className={item.addressLat!==null&&item.addressLng!==null?'profile-address-book__pin--saved':undefined}>{item.addressLat!==null&&item.addressLng!==null?<><CircleCheck size={14} aria-hidden="true"/>Delivery pin saved</>:<><MapPin size={14} aria-hidden="true"/>No delivery pin</>}</small></div>
      <div className="profile-address-book__actions">
        {item.id!==draft.defaultAddressId&&<button type="button" className="account-button account-button--secondary" aria-label={`Set ${item.label} as default`} disabled={disabled||busy||Boolean(editing)} onClick={()=>void saveBook(addresses,item.id)}>Set as default</button>}
        <button type="button" className="account-button account-button--secondary" aria-label={`Edit ${item.label}`} disabled={disabled||busy||Boolean(editing)} onClick={()=>edit(item)}>Edit</button>
        <button type="button" className="account-button account-button--secondary profile-address-book__remove" aria-label={`Remove ${item.label}`} title={`Remove ${item.label}`} disabled={disabled||busy||Boolean(editing)} onClick={()=>void saveBook(addresses.filter(entry=>entry.id!==item.id),draft.defaultAddressId===item.id?addresses.find(entry=>entry.id!==item.id)?.id||null:draft.defaultAddressId||null)}><Trash2 size={16} aria-hidden="true"/></button>
      </div>
    </article>)}</div>
    {editing&&<section className="profile-address-book__form" aria-label="Address form">
      <label>Address label<input maxLength={50} placeholder="Home, work, family…" value={editing.label} disabled={disabled||busy} onChange={event=>setEditing({...editing,label:event.target.value})}/></label>
      <ProfileAddressEditor draft={editing.value} disabled={disabled||busy} onChange={value=>setEditing({...editing,value})}/>
      <div className="profile-address-book__actions"><button type="button" className="account-button account-button--primary" disabled={disabled||busy} onClick={()=>void saveAddress()}>{busy?'Saving address…':'Save address'}</button><button type="button" className="account-button account-button--secondary" disabled={disabled||busy} onClick={()=>{setEditing(null);setError('');}}>Cancel address</button></div>
    </section>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
