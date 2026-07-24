-- Forward-only binding of installed evidence to the immutable Option-C contract.
-- The selected hash covers the metrics plus the versioned mapping, exception,
-- measurement, unit, and variance contracts. No deployed migration is edited.

do $$
declare
  target regprocedure;
  definition text;
begin
  foreach target in array array[
    'public.governance_stage_product_experience_baseline_v1(uuid,text,text,text,text,text,text,text,text)'::regprocedure,
    'public.governance_evaluate_product_experience_baseline_v1(uuid,text,text,text)'::regprocedure,
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if strpos(definition, '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184') = 0 then
      raise exception 'expected prior baseline hash is absent from %', target;
    end if;
    execute replace(
      definition,
      '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    );
  end loop;
end;
$$;

do $$
declare
  constraint_name text := 'product_experience_baseline_versions_identifier_check';
  table_name text := 'product_experience_baseline_versions';
  definition text;
begin
  for constraint_name, table_name in
    select *
    from (values
      ('product_experience_baseline_versions_identifier_check',
       'product_experience_baseline_versions'),
      ('product_experience_baseline_execution_stages_baseline_hash_check',
       'product_experience_baseline_execution_stages')
    ) as contracts(constraint_name, table_name)
  loop
    select pg_get_constraintdef(oid)
      into definition
      from pg_constraint
     where conname = constraint_name
       and conrelid = format('public.%I', table_name)::regclass;
    if strpos(definition, '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184') = 0 then
      raise exception 'expected prior baseline hash is absent from %.%', table_name, constraint_name;
    end if;
    execute format(
      'alter table public.%I drop constraint %I',
      table_name,
      constraint_name
    );
    execute format(
      'alter table public.%I add constraint %I %s',
      table_name,
      constraint_name,
      replace(
        definition,
        '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184',
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
      )
    );
  end loop;
end;
$$;

create function public.product_experience_baseline_v1_mapping_contract(
  p_mapping_id text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_mapping_id
    when 'home_standard_discovery_rows' then '{"family":"standard_streaming_card","hash":"1da877c4587ae6389b78f5c57dd212b473fbeae22a9db4885000a8b961f6a44d","exceptionContractId":null}'::jsonb
    when 'home_featured_hero' then '{"family":"featured_hero_card","hash":"9d813e473c5eeca5965812fcbc4cc2f8cf3e07871325a4ac95fb51258fd9af41","exceptionContractId":"full_width_featured_banner_v1"}'::jsonb
    when 'home_creator_media_rows' then '{"family":"creator_streaming_card","hash":"f0a9eeec1e2c67a79d4255b0a4eb985e3ce088a4672c2bd65139880f1bd2f889","exceptionContractId":null}'::jsonb
    when 'home_activity_discovery_cards' then '{"family":"standard_streaming_card","hash":"9ac317a44dfa63a9b64f16dfbdd67456c0f135de850cb2da8c5eae80a584ab41","exceptionContractId":null}'::jsonb
    when 'explore_title_discovery_rows' then '{"family":"standard_streaming_card","hash":"c4cb312b420c50c283e61535f8501d6ae38d8660dfb288c395e7b1739b138e3d","exceptionContractId":null}'::jsonb
    when 'explore_creator_video_results' then '{"family":"creator_streaming_card","hash":"6465e5e2462267e58b7fd039daeebf3dc3804f5379a198ff9e5d883aec9f4ad8","exceptionContractId":null}'::jsonb
    when 'explore_live_discovery_rows' then '{"family":"live_streaming_card","hash":"089d3ce12c9653fd111445088fc4ba523365477d607077f5048a68a3c1f0fcd6","exceptionContractId":null}'::jsonb
    when 'search_media_results' then '{"family":"standard_streaming_card","hash":"1ceb014492cc4d5dfb6a1f4a20afbd3615bcb4cded2278264f234e10d00361f6","exceptionContractId":null}'::jsonb
    when 'search_people_results' then '{"family":"non_media_interactive_surface","hash":"e2c331739df710de85372804072e891431090e34d409ecd260fe6783461d0156","exceptionContractId":"non_streaming_discovery_route_v1"}'::jsonb
    when 'library_title_media_rows' then '{"family":"standard_streaming_card","hash":"8046bc353d060459f17f0f57ab96463d6ad6d86102185c5adfc205485e51efd5","exceptionContractId":null}'::jsonb
    when 'library_creator_media_rows' then '{"family":"creator_streaming_card","hash":"5b342920eacd19b57f197d9e5113ada20b4b6c05e7020efb7e08440a97181d26","exceptionContractId":null}'::jsonb
    when 'library_redirect_shell' then '{"family":"non_media_interactive_surface","hash":"99814605e9a2a35885134af23cac46f3543f56b89985c7a56935327eb6d45200","exceptionContractId":"non_streaming_discovery_route_v1"}'::jsonb
    when 'title_primary_artwork' then '{"family":"featured_hero_card","hash":"9eced75aea5d4ffe87a862f7c4f21fb5eacfcfcfdac833f0949cb4aae198d3b4","exceptionContractId":"full_width_featured_banner_v1"}'::jsonb
    when 'player_full_surface' then '{"family":"non_media_interactive_surface","hash":"a1fc4f2f5b6f31c253aba2dc2c2716d699e318af91f4d3d38faf4d8041541ba1","exceptionContractId":"full_player_surface_v1"}'::jsonb
    when 'player_recommendation_rows' then '{"family":"standard_streaming_card","hash":"38a361f46260b6884d4c2b01193bed5d053b21fdb7383e6e2e79c6d5eb9f019f","exceptionContractId":null}'::jsonb
    when 'public_channel_featured_media' then '{"family":"featured_hero_card","hash":"966fea9ea7383c337377bae8de876fea9b71854cd1ff5503f5a2d184a48628f1","exceptionContractId":"full_width_featured_banner_v1"}'::jsonb
    when 'public_channel_creator_media_rows' then '{"family":"creator_streaming_card","hash":"69f52715d516c3bfbaf8292f610b87432ce0e9bec37f0e57a47ae1f81c949cd0","exceptionContractId":null}'::jsonb
    when 'public_profile_creator_media_rows' then '{"family":"creator_streaming_card","hash":"0a61815e9858fefa4cc93a3322cc0634bc62a497001125900ce8f1e58a97475a","exceptionContractId":null}'::jsonb
    when 'live_discovery_cards' then '{"family":"live_streaming_card","hash":"cdeb267f422b121bb3d51f0e6d59bad419d65dd21e62b9a87ad39a50e26409af","exceptionContractId":null}'::jsonb
    when 'watch_party_discovery_rows' then '{"family":"standard_streaming_card","hash":"7720387c7c2a880a63cca0271bd02ba5e8d0db765b5c95536ce93dfa2075cd9b","exceptionContractId":null}'::jsonb
    when 'watch_party_entry_controls' then '{"family":"non_media_interactive_surface","hash":"900ec3a06999a1a7afcb88da0580d829902a1839cf26b54446cfa99e87aa2300","exceptionContractId":"non_streaming_discovery_route_v1"}'::jsonb
    when 'watch_party_room_controls' then '{"family":"non_media_interactive_surface","hash":"60454ac2a7f8a31712551c025fbadd4e5ae516538fbc5df0b7c878f0792757d9","exceptionContractId":"non_streaming_discovery_route_v1"}'::jsonb
    when 'watch_party_live_stage_surface' then '{"family":"non_media_interactive_surface","hash":"fb7661728d122c2ee79bee532387a50b22ff4e7897acbcfc254120fe31d2c306","exceptionContractId":"full_player_surface_v1"}'::jsonb
    when 'vertical_social_attachment' then '{"family":"vertical_post_card","hash":"960ee0ec5a901e1d7887d84cfdb862725c732abede1904eac0ad5b01e8fc415a","exceptionContractId":"vertical_short_form_v1"}'::jsonb
    when 'compact_communication_media_preview' then '{"family":"compact_media_list_item","hash":"a57fc5c80cff280ab998a925aec96b5d0c3bfd5d37f48b2f979e5b35e0e11030","exceptionContractId":"chat_attachment_v1"}'::jsonb
    else null
  end
$$;

create function public.product_experience_baseline_v1_exception_hash(
  p_exception_id text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_exception_id
    when 'full_width_featured_banner_v1' then '731a0b271122e60b5576c3d04729ab1866334ebb9827a84b8cfe9a19ccf4d5ac'
    when 'vertical_short_form_v1' then '66909a7e1aa9f993d57b15f98cf68c58d953e595849a0c9b53739027d3e248a3'
    when 'creator_profile_header_v1' then 'a48975689c6b4d98130713b8bd73f6ef8d9eec0c24bb537c9f1e92b847784775'
    when 'full_player_surface_v1' then 'a9f9ac09d7b709f3e8bda5774bc939e29bce7e99619e7c075a152c12cbb9960d'
    when 'comments_social_body_v1' then 'b6242baedb4f693d592442b95a43570cad67b03c97800f2e4b9dbd4e60bee6b0'
    when 'chat_attachment_v1' then '63e14f8920a9a455263c7f2e15a29a2d6458583a62c84d6913b17819df61aed6'
    when 'settings_form_v1' then 'a76e448d0ffdc899a3c336a376ed59cc28c61ddce1706c0efa73269ad614ea3b'
    when 'compact_notification_v1' then 'cef466a647a5bad9b6b5a1ef1bf22c0f4e92b04e576a789a7ecb1b09c2ee04e2'
    when 'administrative_control_v1' then 'f3c72ec50ed7210f3e7284d5dcd6601d1c7306d2f1352296ddb131c2126edabe'
    when 'non_streaming_discovery_route_v1' then '18a3bb4c47a9f78849f15249776daea979abf11b9446f3773dc59d1a74f9894e'
    else null
  end
$$;

create function public.product_experience_baseline_v1_evidence_binding_is_valid(
  p_metrics jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with contract as (
    select public.product_experience_baseline_v1_mapping_contract(
      p_metrics->>'routeFamilyMappingId'
    ) as value
  )
  select coalesce(
    value is not null
    and p_metrics->>'routeFamilyMappingHash' = value->>'hash'
    and p_metrics->>'surfaceFamily' = value->>'family'
    and (
      (
        value->'exceptionContractId' = 'null'::jsonb
        and p_metrics->'exceptionContractId' = 'null'::jsonb
        and p_metrics->'exceptionContractHash' = 'null'::jsonb
        and p_metrics->'exceptionVersioned' = 'false'::jsonb
      )
      or (
        value->'exceptionContractId' <> 'null'::jsonb
        and p_metrics->>'exceptionContractId' =
          value->>'exceptionContractId'
        and p_metrics->>'exceptionContractHash' =
          public.product_experience_baseline_v1_exception_hash(
            value->>'exceptionContractId'
          )
        and p_metrics->'exceptionVersioned' = 'true'::jsonb
      )
    ),
    false
  )
  from contract
$$;

do $$
declare
  target constant regprocedure :=
    'public.product_experience_option_c_visual_layout_is_valid(public.cognitive_platform,text,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(target);
begin
  if strpos(definition, 'not between 14 and 18') = 0
     or strpos(definition, 'not between 1.35 and 1.49') = 0
     or strpos(definition, 'not between 30 and 34') = 0
     or strpos(definition, 'not between 2.9 and 3.1') = 0 then
    raise exception 'expected prior Option-C variance contract is absent';
  end if;
  definition := replace(definition, 'not between 14 and 18', 'not between 12 and 20');
  definition := replace(definition, 'not between 10 and 14', 'not between 8 and 16');
  definition := replace(definition, 'not between 18 and 22', 'not between 16 and 24');
  definition := replace(definition, 'not between 1.35 and 1.49', 'not between 1.27 and 1.57');
  definition := replace(definition, 'not between 30 and 34', 'not between 28 and 36');
  definition := replace(definition, 'not between 22 and 26', 'not between 20 and 28');
  definition := replace(definition, 'not between 2.9 and 3.1', 'not between 2.85 and 3.15');
  execute definition;
end;
$$;

alter function public.product_experience_option_c_visual_layout_is_valid(
  public.cognitive_platform, text, jsonb
) rename to product_experience_option_c_visual_layout_is_valid_pre_contract_binding;

create function public.product_experience_option_c_visual_layout_is_valid(
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metrics jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.product_experience_baseline_v1_evidence_binding_is_valid(p_metrics)
    and public.product_experience_option_c_visual_layout_is_valid_pre_contract_binding(
      p_platform,
      p_result_status,
      case
        when p_metrics->>'baselineComparisonHash' =
          '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
        then jsonb_set(
          p_metrics,
          '{baselineComparisonHash}',
          '"0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184"'::jsonb
        )
        else p_metrics
      end
    )
$$;

alter function public.product_experience_option_c_touch_target_is_valid(
  public.cognitive_platform, text, jsonb
) rename to product_experience_option_c_touch_target_is_valid_pre_contract_binding;

create function public.product_experience_option_c_touch_target_is_valid(
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metrics jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.product_experience_baseline_v1_evidence_binding_is_valid(p_metrics)
    and p_metrics ?& array[
      'interactiveAncestorActuallyInteractive',
      'interactiveAncestorRolePresent',
      'interactiveAncestorClickActionPresent',
      'interactiveAncestorIsTargetContainer'
    ]
    and (
      (
        p_metrics->'interactiveAncestorPresent' = 'true'::jsonb
        and p_metrics->'interactiveAncestorActuallyInteractive' = 'true'::jsonb
        and p_metrics->'interactiveAncestorRolePresent' = 'true'::jsonb
        and p_metrics->'interactiveAncestorClickActionPresent' = 'true'::jsonb
        and p_metrics->'interactiveAncestorIsTargetContainer' = 'true'::jsonb
      )
      or (
        p_metrics->'interactiveAncestorPresent' = 'false'::jsonb
        and p_metrics->'interactiveAncestorActuallyInteractive' = 'false'::jsonb
        and p_metrics->'interactiveAncestorRolePresent' = 'false'::jsonb
        and p_metrics->'interactiveAncestorClickActionPresent' = 'false'::jsonb
        and p_metrics->'interactiveAncestorIsTargetContainer' = 'false'::jsonb
        and p_metrics->'interactiveAncestorWidth' = 'null'::jsonb
        and p_metrics->'interactiveAncestorHeight' = 'null'::jsonb
      )
    )
    and public.product_experience_option_c_touch_target_is_valid_pre_contract_binding(
      p_platform,
      p_result_status,
      case
        when p_metrics->>'baselineComparisonHash' =
          '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
        then jsonb_set(
          p_metrics,
          '{baselineComparisonHash}',
          '"0ba4a4ad6d80c0f2aebc588686fb3f7fb420b9f48f5812077a75137164c3184"'::jsonb
        )
        else p_metrics
      end
    )
$$;

revoke all on function public.product_experience_baseline_v1_mapping_contract(text)
from public, anon, authenticated, service_role;
revoke all on function public.product_experience_baseline_v1_exception_hash(text)
from public, anon, authenticated, service_role;
revoke all on function public.product_experience_baseline_v1_evidence_binding_is_valid(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.product_experience_option_c_visual_layout_is_valid(
  public.cognitive_platform, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.product_experience_option_c_touch_target_is_valid(
  public.cognitive_platform, text, jsonb
) from public, anon, authenticated, service_role;

comment on function public.product_experience_baseline_v1_evidence_binding_is_valid(jsonb)
is 'Fail-closed validation of immutable route-family and exception-contract IDs and hashes for the selected baseline.';
