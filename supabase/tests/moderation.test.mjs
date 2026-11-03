// Run after installing PGlite into ignored tmp/moderation-db; never connects to production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../tmp/moderation-db/node_modules/@electric-sql/pglite/dist/index.js';
import { fixtures } from '../../server/shared/moderation/fixtures.mjs';
import { censorMessageBody } from '../../server/shared/moderation/index.mjs';

test('migration enforces direct writes, matches shared fixtures, preserves history and structured fields', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table messages(id int primary key, text text, metadata jsonb, read boolean default false);
      create table conversations(id int, last_message text);
      create table notifications(id int, title text, message text, read boolean);
      create table product_reviews(id int, body text, user_name text);
      create table design_requests(id int, buyer_note text, shop_response text, design_snapshot jsonb);
      create table design_request_revisions(id int, buyer_note text, design_snapshot jsonb);
      create table design_request_events(id int, payload jsonb);
      insert into messages(id,text) values(1,'shit');`);
    await db.exec(await readFile(new URL('../migrations/20261103000000_censor_communications.sql', import.meta.url), 'utf8'));
    for (const [input, expected] of fixtures) {
      const { rows } = await db.query('select public.censor_message_text($1) as text', [input]);
      assert.equal(rows[0].text, expected, String(input));
    }
    await db.exec(`update messages set read=true where id=1;`);
    assert.equal((await db.query('select text from messages where id=1')).rows[0].text, 'shit');
    await db.exec(`insert into messages(id,text) values(2,'puta'); update messages set text='gago' where id=2;`);
    assert.equal((await db.query('select text from messages where id=2')).rows[0].text, '****');
    const card = JSON.stringify({ type: 'product_inquiry', message: 'shit', productName: 'shit', design: { note: 'shit' }, productPrice: 700 });
    await db.query('insert into messages(id,text) values(3,$1)', [card]);
    const saved = (await db.query('select text from messages where id=3')).rows[0].text;
    assert.deepEqual(JSON.parse(saved), JSON.parse(censorMessageBody(card)));
    await db.exec(`insert into product_reviews values(1,'gago','gago');
      insert into design_requests values(1,'puta','shit','{"name":"shit"}');
      insert into design_request_revisions values(1,'puta','{"name":"shit"}');
      insert into design_request_events values(1,'{"response":"gago","summary":{"shop_response":"shit"},"design_snapshot":{"note":"shit"}}');
      insert into conversations values(1,'shit'); insert into notifications values(1,'New Message','puta',false);`);
    assert.deepEqual((await db.query('select body,user_name from product_reviews')).rows[0], { body:'****', user_name:'gago' });
    assert.deepEqual((await db.query('select buyer_note,shop_response,design_snapshot from design_requests')).rows[0], { buyer_note:'****', shop_response:'****', design_snapshot:{name:'shit'} });
    assert.equal((await db.query('select buyer_note from design_request_revisions')).rows[0].buyer_note,'****');
    assert.deepEqual((await db.query('select payload from design_request_events')).rows[0].payload, {response:'****',summary:{shop_response:'****'},design_snapshot:{note:'shit'}});
    assert.equal((await db.query('select last_message from conversations')).rows[0].last_message,'****');
    assert.equal((await db.query('select message from notifications')).rows[0].message,'****');
    await db.exec(await readFile(new URL('../rollback/20261103000000_censor_communications.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into messages(id,text) values(4,'shit');`);
    assert.equal((await db.query('select text from messages where id=4')).rows[0].text,'shit');
  } finally { await db.close(); }
});
