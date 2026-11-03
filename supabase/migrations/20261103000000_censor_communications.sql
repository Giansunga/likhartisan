-- Generated dictionary v1. Do not edit; run node server/scripts/generate-moderation.mjs.
begin;
create or replace function public.censor_message_text(input text) returns text
language plpgsql immutable strict set search_path = pg_catalog as $function$
declare
  folded text := ''; result text := ''; c text; f text; pattern text;
  n integer := char_length(input); i integer; j integer; pos integer; finish integer; cursor_pos integer;
  protected boolean[] := array_fill(false, array[char_length(input)]);
  masked boolean[] := array_fill(false, array[char_length(input)]);
begin
  if n = 0 then return input; end if;
  for i in 1..n loop
    c := substr(input,i,1);
    f := lower(regexp_replace(normalize(c,NFKD), '[̀-ͯ]', '', 'g'));
    folded := folded || case when char_length(f) = 1 then f when c ~ '[̀-ͯ]' then '.' else '#' end;
  end loop;
  cursor_pos := 1;
  loop
    pos := regexp_instr(input, 'https?://[^\s]+|www\.[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|`[^`]*`|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|(?:[A-Za-z0-9]{2,}_)+[A-Za-z0-9]{2,}|(?:/[A-Za-z0-9_.-]+){2,}', cursor_pos, 1, 0, 'i');
    exit when pos = 0;
    finish := regexp_instr(input, 'https?://[^\s]+|www\.[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|`[^`]*`|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|(?:[A-Za-z0-9]{2,}_)+[A-Za-z0-9]{2,}|(?:/[A-Za-z0-9_.-]+){2,}', cursor_pos, 1, 1, 'i');
    for j in pos..finish-1 loop protected[j] := true; end loop;
    cursor_pos := greatest(finish,pos+1);
  end loop;
  foreach pattern in array array['(^|[^a-z0-9])(m[ ._-]*[o0][ ._-]*[t7][ ._-]*h[ ._-]*[e3][ ._-]*r[ ._-]*f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[e3][ ._-]*r[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]+[i1!][ ._-]*n[ ._-]*[a@4][ ._-]+m[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(m[ ._-]*[o0][ ._-]*[t7][ ._-]*h[ ._-]*[e3][ ._-]*r[ ._-]*f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[e3][ ._-]*r)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4][ ._-]*m[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]+[i1!][ ._-]*n[ ._-]*[a@4][ ._-]+m[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*r[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*[a@4][ ._-]*d[ ._-]*[o0][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]+[i1!][ ._-]*n[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*[o0][ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]+[i1!][ ._-]*n[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[a@4][ ._-]*h[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*k[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*u[ ._-]*[t7][ ._-]*[i1!][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4][ ._-]*m[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*[o0][ ._-]*[t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*g[ ._-]*[a@4][ ._-]*g[ ._-]*u[ ._-]*h[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*r[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*[a@4][ ._-]*d[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*r[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*[a@4][ ._-]*d[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*b[ ._-]*[o0][ ._-]*b[ ._-]*[o0][ ._-]*h[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*u[ ._-]*l[ ._-]*l[ ._-]*[s$5][ ._-]*h[ ._-]*[i1!][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[a@4][ ._-]*[s$5][ ._-]*[t7][ ._-]*[a@4][ ._-]*r[ ._-]*d[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([a@4][ ._-]*[s$5][ ._-]*[s$5][ ._-]*h[ ._-]*[o0][ ._-]*l[ ._-]*[e3][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]+[i1!][ ._-]*n[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*n[ ._-]*y[ ._-]*[e3][ ._-]*m[ ._-]*[a@4][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4][ ._-]*g[ ._-]*[a@4][ ._-]*g[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*u[ ._-]*l[ ._-]*u[ ._-]*l[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[a@4][ ._-]*h[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(h[ ._-]*[a@4][ ._-]*y[ ._-]*[o0][ ._-]*p[ ._-]+k[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*u[ ._-]*[t7][ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*u[ ._-]*[t7][ ._-]*[i1!][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*[o0][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[i1!][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[e3][ ._-]*r[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[i1!][ ._-]*[t7][ ._-]*c[ ._-]*h[ ._-]*[e3][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[a@4][ ._-]*[s$5][ ._-]*[t7][ ._-]*[a@4][ ._-]*r[ ._-]*d)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([a@4][ ._-]*[s$5][ ._-]*[s$5][ ._-]*h[ ._-]*[o0][ ._-]*l[ ._-]*[e3])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(n[ ._-]*[i1!][ ._-]*g[ ._-]*g[ ._-]*[e3][ ._-]*r[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*[a@4][ ._-]*g[ ._-]*g[ ._-]*[o0][ ._-]*[t7][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[i1!][ ._-]*n[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*n[ ._-]*y[ ._-]*[e3][ ._-]*[t7][ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[a@4][ ._-]*g[ ._-]*u[ ._-]*h[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[a@4][ ._-]*g[ ._-]*u[ ._-]*h[ ._-]*[i1!][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[a@4][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*u[ ._-]*w[ ._-]*[i1!][ ._-]*[s$5][ ._-]*[i1!][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*u[ ._-]*p[ ._-]*[a@4][ ._-]*l[ ._-]*[a@4][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[e3][ ._-]*d)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[e3][ ._-]*r)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([s$5][ ._-]*h[ ._-]*[i1!][ ._-]*[t7][ ._-]*[t7][ ._-]*y)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(n[ ._-]*[i1!][ ._-]*g[ ._-]*g[ ._-]*[e3][ ._-]*r)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(n[ ._-]*[i1!][ ._-]*g[ ._-]*g[ ._-]*[a@4][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*[a@4][ ._-]*g[ ._-]*g[ ._-]*[o0][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[a@4][ ._-]*g[ ._-]*[o0][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[a@4][ ._-]*g[ ._-]*[a@4][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(u[ ._-]*l[ ._-]*u[ ._-]*l[ ._-]*[i1!][ ._-]*n)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[o0][ ._-]*b[ ._-]*[o0][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[o0][ ._-]*b[ ._-]*[a@4][ ._-]*n[ ._-]*g)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(l[ ._-]*[i1!][ ._-]*n[ ._-]*[t7][ ._-]*[i1!][ ._-]*k)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*w[ ._-]*[i1!][ ._-]*[s$5][ ._-]*[i1!][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*[a@4][ ._-]*k[ ._-]+y[ ._-]*u)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*[a@4][ ._-]*n[ ._-]*[t7][ ._-]*[o0][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*[e3][ ._-]*k[ ._-]*p[ ._-]*[e3][ ._-]*k)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*u[ ._-]*c[ ._-]*k[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([s$5][ ._-]*h[ ._-]*[i1!][ ._-]*[t7][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[i1!][ ._-]*[t7][ ._-]*c[ ._-]*h)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(c[ ._-]*u[ ._-]*n[ ._-]*[t7][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(d[ ._-]*[i1!][ ._-]*c[ ._-]*k[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(c[ ._-]*[o0][ ._-]*c[ ._-]*k[ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*[s$5][ ._-]*[s$5][ ._-]*y)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(n[ ._-]*[i1!][ ._-]*g[ ._-]*g[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[a@4][ ._-]*n[ ._-]*g[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(l[ ._-]*[e3][ ._-]*c[ ._-]*h[ ._-]*[e3])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*[a@4][ ._-]*k[ ._-]*y[ ._-]*u)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(k[ ._-]*u[ ._-]*p[ ._-]*[a@4][ ._-]*l)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([e3][ ._-]*[t7][ ._-]*[i1!][ ._-]*[t7][ ._-]*[s$5])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*u[ ._-]*r[ ._-]*[a@4][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[i1!][ ._-]*l[ ._-]*[a@4][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(f[ ._-]*u[ ._-]*c[ ._-]*k)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([s$5][ ._-]*h[ ._-]*[i1!][ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(c[ ._-]*u[ ._-]*n[ ._-]*[t7])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(d[ ._-]*[i1!][ ._-]*c[ ._-]*k)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(c[ ._-]*[o0][ ._-]*c[ ._-]*k)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*[t7][ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*[o0][ ._-]*[t7][ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[a@4][ ._-]*g[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(g[ ._-]*[a@4][ ._-]*g[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(u[ ._-]*l[ ._-]*[o0][ ._-]*l)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(u[ ._-]*l[ ._-]*u[ ._-]*l)(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[o0][ ._-]*b[ ._-]*[o0])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(b[ ._-]*[o0][ ._-]*b[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(y[ ._-]*[a@4][ ._-]*w[ ._-]*[a@4])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[i1!][ ._-]*[t7][ ._-]*[e3])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])([t7][ ._-]*[i1!][ ._-]*[t7][ ._-]*[i1!])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*k[ ._-]*[e3])(?=$|[^a-z0-9])',
    '(^|[^a-z0-9])(p[ ._-]*u[ ._-]*k[ ._-]*[i1!])(?=$|[^a-z0-9])'] loop
    cursor_pos := 1;
    loop
      pos := regexp_instr(folded, pattern, cursor_pos, 1, 0, '', 2);
      exit when pos = 0;
      finish := regexp_instr(folded, pattern, cursor_pos, 1, 1, '', 2);
      if not true = any(protected[pos:finish-1]) then
        for j in pos..finish-1 loop
          if substr(input,j,1) ~ '[[:alnum:]]' then masked[j] := true; end if;
        end loop;
      end if;
      cursor_pos := greatest(finish,pos+1);
    end loop;
  end loop;
  for i in 1..n loop result := result || case when masked[i] then '*' else substr(input,i,1) end; end loop;
  return result;
end $function$;

create or replace function public.censor_message_payload(input jsonb) returns jsonb
language plpgsql immutable strict set search_path = pg_catalog, public as $function$
declare result jsonb := input; field text;
begin
  if jsonb_typeof(input) <> 'object' then return input; end if;
  foreach field in array array['buyer_note','shop_response','response','note','message'] loop
    if jsonb_typeof(result->field) = 'string' then
      result := jsonb_set(result,array[field],to_jsonb(public.censor_message_text(result->>field)));
    end if;
  end loop;
  if jsonb_typeof(result->'summary') = 'object' then
    result := jsonb_set(result,array['summary'],public.censor_message_payload(result->'summary'));
  end if;
  return result;
end $function$;

create or replace function public.censor_message_body(input text) returns text
language plpgsql immutable strict set search_path = pg_catalog, public as $function$
declare payload jsonb; cleaned jsonb;
begin
  begin payload := input::jsonb; exception when invalid_text_representation then payload := null; end;
  if payload->>'type' in ('product_inquiry','design_request','design_request_update','design_submission') then
    cleaned := public.censor_message_payload(payload);
    return case when cleaned = payload then input else cleaned::text end;
  end if;
  return public.censor_message_text(input);
end $function$;

create or replace function public.censor_communication_record() returns trigger
language plpgsql set search_path = pg_catalog, public as $function$
declare record jsonb := to_jsonb(new); previous jsonb; field text; container text; notes jsonb;
begin
  if TG_OP = 'UPDATE' then previous := to_jsonb(old); end if;
  foreach field in array coalesce(TG_ARGV, array[]::text[]) loop
    if jsonb_typeof(record->field) = 'string' and (TG_OP = 'INSERT' or record->field is distinct from previous->field) then
      record := jsonb_set(record,array[field],to_jsonb(case when field in ('text','last_message') then public.censor_message_body(record->>field) else public.censor_message_text(record->>field) end));
    end if;
  end loop;
  if TG_TABLE_NAME in ('messages','design_request_events') then
    foreach container in array array['metadata','payload'] loop
      notes := record->container;
      if jsonb_typeof(notes) = 'object' and (TG_OP = 'INSERT' or notes is distinct from previous->container) then
        record := jsonb_set(record,array[container],public.censor_message_payload(notes));
      end if;
    end loop;
  end if;
  new := jsonb_populate_record(new,record);
  return new;
end $function$;
drop trigger if exists aa_censor_communication on public.messages;
create trigger aa_censor_communication before insert or update on public.messages
for each row execute function public.censor_communication_record('text');
drop trigger if exists aa_censor_communication on public.conversations;
create trigger aa_censor_communication before insert or update on public.conversations
for each row execute function public.censor_communication_record('last_message');
drop trigger if exists aa_censor_communication on public.notifications;
create trigger aa_censor_communication before insert or update on public.notifications
for each row execute function public.censor_communication_record('title','message');
drop trigger if exists aa_censor_communication on public.product_reviews;
create trigger aa_censor_communication before insert or update on public.product_reviews
for each row execute function public.censor_communication_record('body');
drop trigger if exists aa_censor_communication on public.design_requests;
create trigger aa_censor_communication before insert or update on public.design_requests
for each row execute function public.censor_communication_record('buyer_note','shop_response');
drop trigger if exists aa_censor_communication on public.design_request_revisions;
create trigger aa_censor_communication before insert or update on public.design_request_revisions
for each row execute function public.censor_communication_record('buyer_note');
drop trigger if exists aa_censor_communication on public.design_request_events;
create trigger aa_censor_communication before insert or update on public.design_request_events
for each row execute function public.censor_communication_record();
commit;
