import {describe,it,expect} from 'vitest';
import {readProfileAddressBook,addressBookMetadata} from '../profileAddressBook';
describe('profile address book compatibility',()=>{
 it('preserves the legacy address and pin without creating duplicates',()=>{
  const book=readProfileAddressBook({address:'San Fernando',address_lat:15,address_lng:120});
  expect(book.addresses).toHaveLength(1);expect(book.defaultAddressId).toBe('legacy-default');
  expect(readProfileAddressBook(addressBookMetadata(book.addresses,book.defaultAddressId))).toEqual(book);
 });
 it('falls back to a remaining default and clears all legacy fields after removing the last address',()=>{
  const book=readProfileAddressBook({address:'Pampanga',address_lat:15,address_lng:120});
  expect(addressBookMetadata(book.addresses,'missing').default_address_id).toBe('legacy-default');
  const metadata=addressBookMetadata([],null);
  expect(metadata).toMatchObject({address:'',address_parts:null,address_lat:null,address_lng:null,default_address_id:null,address_book:[]});
  expect(readProfileAddressBook(metadata).addresses).toEqual([]);
 });
 it('rejects malformed and duplicate entries and invalid pins',()=>{
  const book=readProfileAddressBook({address_book_version:1,default_address_id:'bad',address_book:[null,{id:'x',address:'Saved',address_lat:999,address_lng:120},{id:'x',address:'Duplicate'},{id:'empty',address:''}]});
  expect(book.addresses).toHaveLength(1);expect(book.addresses[0].addressLat).toBeNull();expect(book.defaultAddressId).toBe('x');
 });
});
