-- Allow any positive model baseline dimension supported by NUMERIC(5,2).
-- Both names are included because existing and fresh installs create different
-- names for the same four checks.
begin;

alter table public.models_3d
  drop constraint if exists models_3d_base_height_range,
  drop constraint if exists models_3d_base_body_width_range,
  drop constraint if exists models_3d_base_neck_width_range,
  drop constraint if exists models_3d_base_rim_size_range,
  drop constraint if exists models_3d_base_height_in_check,
  drop constraint if exists models_3d_base_body_width_in_check,
  drop constraint if exists models_3d_base_neck_width_in_check,
  drop constraint if exists models_3d_base_rim_size_in_check,
  add constraint models_3d_base_height_range check (base_height_in > 0),
  add constraint models_3d_base_body_width_range check (base_body_width_in > 0),
  add constraint models_3d_base_neck_width_range check (base_neck_width_in > 0),
  add constraint models_3d_base_rim_size_range check (base_rim_size_in > 0);

commit;
