-- Exercise the deployed products constraint without modifying real listings.
begin;

create temporary table product_status_fixture (status text);

do $$
declare
  definition text;
begin
  select pg_get_constraintdef(oid) into definition
  from pg_constraint
  where conrelid = 'public.products'::regclass
    and conname = 'products_status_check';
  if definition is null then
    raise exception 'products_status_check is missing';
  end if;
  execute 'alter table product_status_fixture add constraint fixture_status_check ' || definition;
end;
$$;

insert into product_status_fixture(status) values ('active'), ('draft'), ('archived');
update product_status_fixture set status = 'inactive' where status = 'active';

do $$
begin
  if (select count(*) from product_status_fixture where status = 'inactive') <> 1 then
    raise exception 'Deactivation failed';
  end if;
end;
$$;

update product_status_fixture set status = 'active' where status = 'inactive';

do $$
begin
  if (select count(*) from product_status_fixture where status = 'active') <> 1 then
    raise exception 'Activation failed';
  end if;
  begin
    insert into product_status_fixture(status) values ('invalid-status');
    raise exception 'Invalid product status was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;

rollback;
