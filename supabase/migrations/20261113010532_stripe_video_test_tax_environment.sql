-- Forward-only correction: paid-video sandbox qualifications were admitted by
-- the feature constraint but rejected by the older environment constraint.
-- No qualifications, provider settings, grants or activation switches are changed.
alter table private.commerce_tax_qualifications
 drop constraint commerce_tax_qualifications_environment_check;
alter table private.commerce_tax_qualifications
 add constraint commerce_tax_qualifications_environment_check check (
  (feature='physical_merch' and environment in ('sandbox','production')) or
  (feature in ('event_auction','room_auction') and environment in ('test','live')) or
  (feature='paid_video' and environment='test')
 );
