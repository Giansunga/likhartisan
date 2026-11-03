import { readAddressParts, validAddressCoordinates, type AddressParts } from './profileAddress';

export interface SavedProfileAddress {
  id: string;
  label: string;
  address: string;
  addressParts: AddressParts | null;
  addressLat: number | null;
  addressLng: number | null;
}
export function readProfileAddressBook(metadata: Record<string, unknown>) {
  const addresses: SavedProfileAddress[] = [];
  if(metadata.address_book_version===1 && Array.isArray(metadata.address_book)) {
    for(const raw of metadata.address_book) {
      if(!raw || typeof raw!=='object')continue;
      const item=raw as Record<string,unknown>;
      if(typeof item.id!=='string'||!item.id||typeof item.address!=='string'||!item.address.trim()||addresses.some(entry=>entry.id===item.id))continue;
      const pin=validAddressCoordinates(item.address_lat,item.address_lng);
      addresses.push({id:item.id,label:typeof item.label==='string'?item.label:'Address',address:item.address.trim(),addressParts:readAddressParts(item.address_parts),addressLat:pin?.lat??null,addressLng:pin?.lng??null});
    }
  } else if(typeof metadata.address==='string' && metadata.address.trim()) {
    const pin=validAddressCoordinates(metadata.address_lat,metadata.address_lng);
    addresses.push({id:'legacy-default',label:'Home',address:metadata.address.trim(),addressParts:readAddressParts(metadata.address_parts),addressLat:pin?.lat??null,addressLng:pin?.lng??null});
  }
  const defaultAddressId=addresses.find(item=>item.id===metadata.default_address_id)?.id||addresses[0]?.id||null;
  return {addresses,defaultAddressId};
}
export function addressBookMetadata(addresses:SavedProfileAddress[],defaultAddressId:string|null) {
  const active=addresses.find(item=>item.id===defaultAddressId)||addresses[0];
  return {
    address_book_version:1,
    address_book:addresses.map(item=>({id:item.id,label:item.label,address:item.address,address_parts:item.addressParts,address_lat:item.addressLat,address_lng:item.addressLng})),
    default_address_id:active?.id??null,
    address:active?.address||'',address_parts:active?.addressParts??null,address_lat:active?.addressLat??null,address_lng:active?.addressLng??null,
  };
}
