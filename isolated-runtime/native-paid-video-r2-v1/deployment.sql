-- Fixed forward-only migration 20261110120025_native_paid_video_r2_bounded_v1.
-- Transport project must independently equal bmkkhihfbmsnnmcqkoly; this SQL label is not proof.
-- This body runs only inside the reviewed envelope. No activation or provider changes.
do $context$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
 or current_setting('transaction_isolation')<>'repeatable read' or current_setting('server_version_num')<>'170006'
 or current_setting('transaction_timeout')<>'25s' or current_setting('statement_timeout')<>'20s'
 then raise exception 'r2_deployment_context_invalid';end if;
 if not ((select count(*)=1 and bool_and(not rolsuper) from pg_roles where rolname='postgres')
 and (select count(*)=2 and bool_and(not rolsuper and not rolcanlogin and not rolcreaterole and not rolcreatedb and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner'))
 and (select count(*)=1 and bool_and(not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication) from pg_roles where rolname='supabase_read_only_user')) then raise exception 'r2_role_safety_invalid';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') or exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)) then raise exception 'r2_owner_interval_leaked';end if;
end $context$;
create temporary table r2_forward_before(state jsonb not null) on commit drop;
insert into r2_forward_before with allowed_added as materialized(select value->0 k,value->>1 h from jsonb_array_elements('[[["column","sandbox_commerce_v1.delivery_asset_scans","r2_identity"],"48c2138af4e979bfd57b12a16ba4dbb7fb12f3f6859c4c98717e054886114d20"],[["column","sandbox_commerce_v1.delivery_assets","r2_identity"],"f76cf1f900e725687b20916d890442f517dd5855fe7003647c0ca4093a016534"],[["column","sandbox_commerce_v1.paid_video_uploads","r2_identity"],"e9a4123c39e64555ce4238693850788080c62405a8e2300672b9db671ee55d71"],[["column","sandbox_commerce_v1.r2_bindings","expires_at"],"1d66f9a1bf98cad5a5b3db13b2225e7d55c150135febe366de9c8538c4bd31e9"],[["column","sandbox_commerce_v1.r2_bindings","grant_id"],"c0706291a16dc68569633a0ec9cbf359096791c574746a111647e938e224016b"],[["column","sandbox_commerce_v1.r2_bindings","id"],"ba3c1df9e2a1cea6dd0ac3c210ce3314037238b9597a11b7c21043d26270d85b"],[["column","sandbox_commerce_v1.r2_bindings","issued_at"],"509c9d4013e8fd597b40d8ad198b7a2310b911230151e5bcade35028e5258cb3"],[["column","sandbox_commerce_v1.r2_bindings","operation"],"3df603a3b8631e5835d0dbc211e2cc375de9947adf04b7fe679f14586b7ab1eb"],[["column","sandbox_commerce_v1.r2_bindings","profile_id"],"e840498ec6a3e814594c2c197506f0467408fd987e0a4c147a01c957a20c9639"],[["column","sandbox_commerce_v1.r2_bindings","request_id"],"75d1ea5014ef4907e1896b10d33a43348ec5cbf57ddd6e841e4a090db09d890b"],[["column","sandbox_commerce_v1.r2_bindings","session_id"],"7e9c40b42ee73a45abc56583e93816ac7d3c14a0341f51a6c2f0719475a2f6ec"],[["column","sandbox_commerce_v1.r2_bindings","token"],"bd4d70d1b93a11dcbe0a587447419dfbd4cc93ea0e4fb2d013c4cb4de2c5d7a5"],[["column","sandbox_commerce_v1.r2_bindings","upload_id"],"e011e0123f51ea4529f73e8b3154bb748c89d7f1a07e50932f6eb74758990bf8"],[["column","sandbox_commerce_v1.r2_bindings","user_id"],"11e29b2bc74337be1e1b76fd2820c64ad29ee5bcf6356eb00f68d34d55d00411"],[["column","sandbox_commerce_v1.r2_commits","committed_at"],"fa26f16eae69706b0d123f67886f836874b98ef3fe62d4603b967baee8c9f349"],[["column","sandbox_commerce_v1.r2_commits","identity"],"40260e563ebd22667945fb1d6afd6fee41974498c55314935c26568f150c6d82"],[["column","sandbox_commerce_v1.r2_commits","state"],"157a7c7e176de351196c2232c8dad2b66b0c73b0ffa1c285ca5c94e4f9ef5a16"],[["column","sandbox_commerce_v1.r2_commits","upload_id"],"cb4ee616627b8a80d367f1e9e5c5af89cafb589ab8a94d40ce286515e6548c5f"],[["column","sandbox_commerce_v1.r2_dispatches","binding_id"],"cd2c6295d614d665e8000bc9b4489ed8d63c0c6c68f5f7659351d96f58521a13"],[["column","sandbox_commerce_v1.r2_dispatches","started_at"],"ab16d356dd6e4114e80f2e22db9cf30712b4c006be03bc805e9086114c8d3dcb"],[["column","sandbox_commerce_v1.r2_dispatches","upload_id"],"e1a24a1ff7bd6ad0d67be7c864c804aa3b93ca3b51521f8868e121236f39acfc"],[["column","sandbox_commerce_v1.r2_profiles","capacity_evidence_sha256"],"61f9de912929d16c08be9a3f79e9aa485f875a3d9c0cecd8f29160e176385197"],[["column","sandbox_commerce_v1.r2_profiles","configuration_digest"],"18d014371e7547e39f510a8e0625c705a280b4f8751e346196930d7e885af2ab"],[["column","sandbox_commerce_v1.r2_profiles","enabled"],"72941b3aa9e3d9008c6be667073ffeedb35c8789381f4502477afe6df2cd5774"],[["column","sandbox_commerce_v1.r2_profiles","gateway_key"],"16141dbf686b50120010646a875dc830877719ab7b4a607ed72cfe279d9c4243"],[["column","sandbox_commerce_v1.r2_profiles","id"],"1636ad77c186d08e26f6891162e39dcba1b441e23877633d995e4e18a4fa9bd7"],[["column","sandbox_commerce_v1.r2_profiles","key_id"],"4d5a35e6134d8c20dac6500ec9019952b0b46c029113ca322a3ba5a80024b9c7"],[["column","sandbox_commerce_v1.r2_profiles","qualification_sha256"],"1d9f1381bc8737c22bd704588335117b1d573bdbbaf021ad8589d6d25506ce3d"],[["column","sandbox_commerce_v1.r2_profiles","qualified_max_bytes"],"d36d19864b10c7c197c31206eb786e73bc5658fd39641bd8ecbe10976f9c0174"],[["column","sandbox_commerce_v1.r2_profiles","route_id"],"dae58488fdbe86470586673f23fde4551a83ca16c5add2888f3f5038270b36b5"],[["column","sandbox_commerce_v1.r2_profiles","verifier_id"],"4451d66ccedd147676e83c1325e537015444f9dabeb4ba3d6316ea3bd40a2ae4"],[["column","sandbox_commerce_v1.r2_profiles","worker_id"],"767ffedfb579d999d07cc30e58be8f0dd7aa47d29ebe10ffe93c4473d04f0409"],[["column","sandbox_commerce_v1.r2_receipts","binding_id"],"692796c57efd491724701c36c50ce5a5b3e5ed8d636ffb02b580480be291f4a3"],[["column","sandbox_commerce_v1.r2_receipts","identity"],"f58d458d28e0df981b2ace6d68a5a7656701b3d638f948b44df821499716a775"],[["column","sandbox_commerce_v1.r2_receipts","raw_body"],"cb838c87aa0fc5b582a0a93b01cc4c145042a84198670386656d12e394e091a4"],[["column","sandbox_commerce_v1.r2_receipts","recorded_at"],"b61c9b80c837fcdc157c00e4bd0bfb85d26969386a070a966cfc70bdac40ee48"],[["column","sandbox_commerce_v1.r2_receipts","signature"],"b12071adddbfe5d52b18f89e8cf0f011ef9f7c99ad883af449d5611f1cd432d9"],[["column","sandbox_commerce_v1.r2_receipts","upload_id"],"6413caa0c47675667e2b5810937724be9fcd92ac4a897698e09488b61c6022a5"],[["column","sandbox_commerce_v1.r2_receipts","verifier_id"],"73dad7890f5d873488566042d0f733cc47efa8327dc9e4910bc2b1f2fe50887c"],[["column","sandbox_commerce_v1.r2_tickets","object"],"a0c4348caa29a852dad649cfbeb9691c31fbcec6805ff052fdae5b0692d9a074"],[["column","sandbox_commerce_v1.r2_tickets","profile_id"],"377e75a78cd618802774a1a7c4a8a2a4464f98c9250bdb8142816698ceec1a85"],[["column","sandbox_commerce_v1.r2_tickets","ticket_id"],"13b70cd79dc5eac7a221e9db8480916133fe1de7e6cac09e2a4de92371e1f5fd"],[["columnMetadata","sandbox_commerce_v1.delivery_asset_scans","r2_identity"],"1aa24096be93e94fd145b8a408eed170b43a5c756e3198a9e4faf41cf37c793f"],[["columnMetadata","sandbox_commerce_v1.delivery_assets","r2_identity"],"6d2e2e8b5cd2ac7efdbeda4bfc70e31e7d658f43f5acbf9a149fa50f65a607c9"],[["columnMetadata","sandbox_commerce_v1.paid_video_uploads","r2_identity"],"54089e7afb117a495e5e63c3659783949cbd0619ce3118dafa0f2ec274400b4b"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","expires_at"],"6c1256afe0327c1f6f7f076141564e3d02e5c0ee31b37e56277960e5b2e9624c"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","grant_id"],"466f3e156b21b88f3d9b9065f3a3095be2886d7b48958311d74be8f45db1c44f"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","id"],"8faf6dc41bbf97d24736fb2a15f9d0242f81eaa6beafda321259fb329f81e165"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","issued_at"],"516eb871866af012434885562f800758e9fe53ff8853f2a6a1db32dd279114d7"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","operation"],"7f3aec117ccb9e07bd892dbfb10059e608176b36e964166d00e65f9d59418aa0"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","profile_id"],"e36bb698cff86ef4734214b855c47208f154e9c321cf808d22b05d74546b4b31"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","request_id"],"a7126663fd5fa5e2b08141c27838b33b2d55c30c6789cccb0fa9ccaaa4e32703"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","session_id"],"1fda9b335f12cd62942f5f036c79777210611449a493b127657c34a8f5e3392f"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","token"],"dfae774c919addf0e35cd4c0955da93f0bee843cd42faed40a41e58b3dce50e3"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","upload_id"],"9b39ad614b954bce6b7f99269c31e30f5d32ef912150c39235b81030bcd8a74a"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","user_id"],"2fd76673f0e0b34dbfbd91469da876755cdf309f84910a8716dc5213e50435a7"],[["columnMetadata","sandbox_commerce_v1.r2_commits","committed_at"],"3f1cd89d220f1466f49e64b637f253b283c268410c71f1d7eee354531eba222c"],[["columnMetadata","sandbox_commerce_v1.r2_commits","identity"],"69844a83c3cda9311d7b576ec35965bd23e25e6040b4986957d581ae2f1397bf"],[["columnMetadata","sandbox_commerce_v1.r2_commits","state"],"fe9722a709698bbb4a7093238b97b10d12d8a929de978503468912c35086ed46"],[["columnMetadata","sandbox_commerce_v1.r2_commits","upload_id"],"cc0ba86bf2394dadd1647939db0ccc97d5872919f96b60c9ecfecad2ea7ce472"],[["columnMetadata","sandbox_commerce_v1.r2_dispatches","binding_id"],"0e855d4a3dfce6a533d9cc7f93658481847e210593d665ec59566dd34a676451"],[["columnMetadata","sandbox_commerce_v1.r2_dispatches","started_at"],"c7463ffe2abec18a51448630e38078417e2c5ac91222072dbdeda7e09e1c9340"],[["columnMetadata","sandbox_commerce_v1.r2_dispatches","upload_id"],"7bab9f794433f851a88e2ca83cb906b50ad159ee4b9a97c048838b8776997c39"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","capacity_evidence_sha256"],"df61e3eb2f3512ad9a1305b1b468b150621ebbb92c7ce4740d62d3a9b509a474"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","configuration_digest"],"553daed23351c9d11f9421d329500b99a5955e20a972f1b0ed7a483ec7163490"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","enabled"],"cd71fae61584172bb98a68b23efa286326fbe4a12167ccde5d29b3a8cab0112a"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","gateway_key"],"60e809505c32965ccc1d45f7b3e2474aa395ec80c47f940ee17af930899aaf7d"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","id"],"2c941fd31ab15d74d396b014c26e5eb4b17118a0d4be55245b9551cc8807c7ad"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","key_id"],"2fc3bf96b5ead07f7dc36b276f513333a0fb03dcd72e067890188a0b57de0f67"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","qualification_sha256"],"4ed715714609ad975c85be82ac810a776ac5b9a8f8d71c8c95c405f222a61900"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","qualified_max_bytes"],"309316cd01f9fb395101148be8dc86f12fe70d2544efc2afd3f102a071e88d58"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","route_id"],"4a283f60d1f7dd45d1030c8b949a0759d4bc598d4c9d4f30a3bf494d484cd256"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","verifier_id"],"494c6a6c13a2b07f008ab8041599fb2ac4376170f9b2f1cce8c0d243b2b1fcb6"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","worker_id"],"6a25c9b382340b7cd41b59ce88a1903494cdb4bad90dc329dc8960ce080da589"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","binding_id"],"579b4fd5005c947dcdda72222de553d139b03d1a0aedc1e8ef9a6e00267bbd6f"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","identity"],"b529218f51b3913fe09bb39459e71a6e388c9b82a3cccc4be4731bff30793960"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","raw_body"],"baef5eb10674ad8d68ccffd7279b09b68359deaf2bd8cc13b280a3a3e4f86f30"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","recorded_at"],"60dcb01424cbe013116d6748217703f30d0a60b070b806af09e97bc9a53b64ec"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","signature"],"efcc33983f7a68324680cae0dc85769622b46f445fe73848076ea4346669f6c1"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","upload_id"],"cbdff71588b61b699925cd3cd2de931de855d490502f51b1e907cbecdf17c770"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","verifier_id"],"d5db61dc3971b66a1163905a36841e5f0aebb37bf3824be5e93786c2fff8278f"],[["columnMetadata","sandbox_commerce_v1.r2_tickets","object"],"5a1caaab07608a0af2f561ffbbf9372dddfa91959254e79a2e348ce08ae15658"],[["columnMetadata","sandbox_commerce_v1.r2_tickets","profile_id"],"43410927edaf411588d5905522ab71b26c003605d6498c8cc43ceb43d14ec0a3"],[["columnMetadata","sandbox_commerce_v1.r2_tickets","ticket_id"],"368c4faa1a070ce4b1bade10eab518c84ce889bd4293b0b07afbab50d199b108"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.delivery_asset_scans","typed_object_identity"],"667e1184de1674762920a810e997f88d01f9a5a10b56750e12c367a0cdbbc826"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.delivery_assets","typed_object_identity"],"5cd73bf9110cc6454aaf389d257a19ddaf9dfc14b996c1de19fd80c511485ce4"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.paid_video_uploads","paid_video_uploads_check1"],"c5d98a7aa4a174f72881599aaa89784fecb3857cdf523aef9bd47726fb1438a5"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_check"],"9da2a0a174d58f36c1dfabf6dcd2d512f94f267812638fb06f4d978ac17ec55b"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_operation_check"],"685a6e8c470a48f23f3f0ae4347c96dc9e98c8ffa31cefd4394794df163e00ea"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_pkey"],"6bf36c60f4fff04e179ddd8552783b5a7da47be3371c1b4556450476037baab2"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey"],"1b9b00c53f568cc37ca0b251ea93a109d4197d59310a3334ea5eefd15f76aabe"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey"],"f8456c51e749a45dd2baa28c49ff3510c8c11e1b8e497a166218694ae53f57ee"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_check"],"eaa54a928bc5a8dcfbdae56a2a4d79bd2afbd3196f8f5284157630fa46517f9a"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_pkey"],"0ee0428afb9cf6d96976e0a3a3a14c5c5b12c7446c32670ef079fa833b6850f7"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_state_check"],"41201a6f205d3f7727fc4aadfea3ca99251b0c0276b8361cdece4f150d1c2d61"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey"],"49464a8ab0666ea1117fb71c4e53fcdd659af6fb8df43603dbdc4be0ef704aa5"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey"],"dbdc97663e6c43be24a2d4fb335e83f638def6d4d5053a1f6b124e984a8802ae"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_key"],"812b4e6dfbf8a90514989195984384bc569aea19c1f0e4ba432634217115908e"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_pkey"],"4217a4d45123e5b7d730a88e316dbe0b13fa8da50eb2f561efa99f1365d5ce4f"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey"],"4585d2640b20c0fcea4ce6b1a501945d01bdcad2dafde5d9113319bf7dce9d41"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_capacity_evidence_sha256_check"],"63b70d3d64fbd3fffff279d87c6918788292c55d27fd060a454625de553dd4de"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_configuration_digest_check"],"146ee65c5cb5700071ad7bd487764080cf9aa27283201cb293da3f51c646dda3"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_configuration_digest_key"],"0eae50f00e5d96321c16bd0e839b0eba13dacf11394b0622e1f1c3c7f7f2c12d"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_gateway_key_check"],"82599107427bc764da2833b4d1a2f7d50c2fb7bfe4f09ee37faa4757a241e43f"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_key_id_key"],"2e18343fafbaf408e852cde3a7aa828a9f9b13bc5820151aa28df43dc1cefdd5"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_pkey"],"cc541d67c302934f7182ef5923aeb950592fe1cc8e71bcf20acd40fab835f0fd"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_qualification_sha256_check"],"d82dbba11c63e4fa7857ce852ba4e7098bbcf9c8efd6f3d96cbefbeb06bd642a"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_qualified_max_bytes_check"],"63ff07de1ac4c178f26d895eff7c825075c5d88b6c19d3df89866fed9f87196e"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey"],"fb9fdc76c55e4845d15a8fe958f4bd0b0989283e8765d9c1901424cd50641a26"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_key"],"5a51dbaf6ef15abdce19cb9ec4602e3500cb0df60c447b53d229ad02a2eb5b76"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey"],"c6988a6aacad5accd3b95365db9bc00098bb3abeee8b9b4783c6eb66165a444e"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey"],"74c989c4790d936a62cb298374f8a1f314e9881b44664d3abb40dba64933c445"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey"],"ea4b708a82ad1a1b6f2bd6b1b9e73bd4ff245411680b419f396d965571605b80"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_identity_check"],"a3318b5a89da69d0065c9e4d39d7b4400e2fa46867ac15ad877aec6daf8ae92f"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_pkey"],"b367d083a2864aba9b76a46acad9edc9d35d08348b111299cf8953f969494a83"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_raw_body_check"],"fac26c070fffcaec4364fc8597267715ae67ea9df276ddfbc55ee8c1aa57ceaa"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey"],"7bb09a2ccdb39603b94c89cb573f571ac964efa5fd6e6910076f390ba012d1b3"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey"],"7cba9ea82f7a62843f43798f914a951a1fedf492e78697784d7b9124c12aaa20"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_tickets","r2_tickets_pkey"],"118f14035846dd8533103cd63b401f1a2009192c0029984ef3722878e6df1f21"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey"],"d68672dddb77240173f30ebecdae6d4ed0f05d0ce9108e24ae90d8ea4b05a7ed"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey"],"ddf7078fbe530f10bb1f3eb655fe0d3809f93fff18344360eb01cf24c4789f81"],[["function","public","native_paid_video_r2_admit_v1","p_action text, p_user_id uuid, p_session_id uuid, p_upload_id uuid, p_request_id uuid, p_configuration_digest text, p_range jsonb, p_grant_id uuid"],"139caf19e831e67222b00349fd855dbbea694c2ec5c89b6c2c8c02ad1d5bb46e"],[["function","public","native_paid_video_r2_gateway_v1","p_token jsonb, p_phase text, p_outcome jsonb"],"1dcfc6bf1d1cf49e443ccbc2ddd7dd156e5ecff17235c55a0c9430e6ed17b332"],[["function","public","native_paid_video_r2_next_v1","p_worker_id uuid"],"f5ef71bea048aa53f3f6e1623b17f519ebd50c4348f29b2ce689eb194d008c15"],[["function","public","native_paid_video_r2_private_state_v1",""],"59f8d0b907a85dbc3e1bc5579f295c6cf9737cfa20331a41ef484dec421824a1"],[["function","public","native_paid_video_r2_reconcile_v1","p_raw_body text, p_signature text, p_user_id uuid, p_session_id uuid"],"d21337b0da2008b0bee4ed908cc217fa4188ba2b1ba14815a4debc1aa69ea321"],[["function","public","native_paid_video_r2_route_v1","p_user_id uuid, p_session_id uuid, p_upload_id uuid, p_configuration_digest text"],"25d7ed96b511dee7dabc04601a9351267fd7c84e162aef0bd83ea1a84d5d9f95"],[["function","public","native_paid_video_r2_scan_admit_v1","p_upload_id uuid, p_ticket_id uuid"],"49a2ac0d5bb173ef6e5545241dbec19b752052213c7f7cf8d67d34f5c41ab4b6"],[["function","public","native_paid_video_r2_worker_v1","p_action text, p_upload_id uuid, p_worker_id uuid, p_raw_body text, p_signature text"],"5b8f7a76a0e066936ceac3df543677d4b1580accdbf098b2fc78d7fea9f540f4"],[["function","sandbox_commerce_v1","native_r2_assert_media","i sandbox_commerce_v1.intents"],"03123be6b89cd1af9add6cffb7fed3836a0bea2398e7f665e8c2314551cd9bd8"],[["function","sandbox_commerce_v1","native_store_paid_video_r2_access","p_user uuid, p_session uuid, p_resource uuid, p_grant uuid"],"0dd9a275579373b3b70f7c1dda09ff404009e0fc3fdf5ba98b3772e329b5655a"],[["function","sandbox_commerce_v1","native_typed_assert_media","i sandbox_commerce_v1.intents"],"82b8136ba3f7b361d0eeeb0190243d3dd85d95961ed7848c7e888bdea3be75a9"],[["function","sandbox_commerce_v1","r2_admit","p_action text, p_user uuid, p_session uuid, p_upload uuid, p_request uuid, p_configuration text, p_range jsonb, p_grant uuid"],"9c54947bd27d6838b9f52b08a30f3d2b4c3b10800a08f3900e46d988823b0aa9"],[["function","sandbox_commerce_v1","r2_assert_scanner","p_profile uuid, p_worker uuid"],"75c6384a919846d4d7d3dd30e8e59598019a1e1bae64a6f164e40837ca0a6c87"],[["function","sandbox_commerce_v1","r2_current","p_token jsonb"],"8058e76efa27e65069254e1457fb12f272015b541eb031c07275822339c5c932"],[["function","sandbox_commerce_v1","r2_gateway","p_token jsonb, p_phase text, p_outcome jsonb"],"273b4d7dc0d31275f894d1802562507fc04e95a8af28059b90276ed64bcc8fcc"],[["function","sandbox_commerce_v1","r2_identity_valid","v jsonb"],"4fff1af8ba7736db59905c3d5d25c998dc79779c4c3cda7ba68f4deb4fad94b4"],[["function","sandbox_commerce_v1","r2_lease","p_upload uuid, p_worker uuid"],"380f19cfc16dc55d23a9f2cbef2c4bd7705ceb200f3297087ccd21f6f4b11274"],[["function","sandbox_commerce_v1","r2_object","p_upload uuid, p_identity boolean"],"e97926640e7d79b8ddd604f781975f740dfe775bd88e6f2b7344553666e99654"],[["function","sandbox_commerce_v1","r2_ready","p_configuration text, p_route uuid"],"4d4f368a4f7ba32a53de75081490786364c1aad34b95eaa47e3f4b44acffab47"],[["function","sandbox_commerce_v1","r2_receipt_json","p_upload uuid"],"c10433417853d6d2cb3af701d1d47655215ccb4efe77236fe0d5d909ec1af3e0"],[["function","sandbox_commerce_v1","r2_reconcile","p_raw text, p_signature text, p_user uuid, p_session uuid"],"c3c4bf3391b90cdd616fb6e37d63894baf554ebfc5d68a3dbf5ddff71a15fad7"],[["function","sandbox_commerce_v1","r2_review_object","p_upload uuid"],"de75d448be7191f7e6f24b0487b61c7ddf534e2b14a4e8aed9757f8f734adf93"],[["function","sandbox_commerce_v1","r2_scan_ingest","p_raw_body text, p_signature text"],"ea5ea638d4e669ef146e310086100a6db09a0b443586291d9e0cc357028af3b7"],[["function","sandbox_commerce_v1","r2_upload_identity_guard",""],"bfb03a62ef8904dec21bf80fef43a33d22a45c020f8985cb44dc32b82ad2fe97"],[["index","sandbox_commerce_v1.delivery_assets","delivery_assets_r2_identity"],"1e7789abc95194a43787402cee45d148344fb2c9a1e1f8d9d41aa138e9a86c58"],[["index","sandbox_commerce_v1.r2_bindings","r2_bindings_pkey"],"935d66b243c2c1cb30b893d3e6ead00dd8f1804b33da49f16236bd5d432b1e7f"],[["index","sandbox_commerce_v1.r2_bindings","r2_one_upload_binding"],"46b7c61841ddc69e85d1d3054195e3b188787575d7cb4ac3fda995dab3aabc3c"],[["index","sandbox_commerce_v1.r2_commits","r2_commits_pkey"],"a4ad00c5e35090f9ddf3011d2f180a46628e4f8522859d270c1479f97ff738c7"],[["index","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_key"],"bc457db9a0e94da43fdce6d8578692eec52370ad0f920b71c4f8c628efc1ca3f"],[["index","sandbox_commerce_v1.r2_dispatches","r2_dispatches_pkey"],"24a6ab70acb35beaa572e3c73f222043a26721ab2beb48ab47f2301c575ac5b2"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_configuration_digest_key"],"a79c38e572e293eb007835abf0393ede23fbb7ba02159c6c10650475cd10bdd1"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_key_id_key"],"3685d453b2c8facef5b7a5aeb6f839a4cfd9c26087655ccff8b2ff3addfb8122"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_pkey"],"61f866446a566e4a4efbfc901983f5bf09ac2b012cc4856584937a5860b596c2"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_key"],"918309362c4dd119d1aa47a6a5a3df0a4318614b688a3777320d57eb127c5efb"],[["index","sandbox_commerce_v1.r2_receipts","r2_receipts_pkey"],"deaa7023ede6b11baebc2aa11dbf3ebfa08cb67f5912cefc6db2c7e3115e1ba3"],[["index","sandbox_commerce_v1.r2_tickets","r2_tickets_pkey"],"1334a637de213541152a481297928b8e5baf04d16062f480ef69e7803dc263ae"],[["membership","sbx_v1_r2_gateway","postgres",{"bootstrapSuperuserOid":10}],"e6d04ae7da9a2b3218c782421b494b3984fe4d92887f4dd6ed096c1a2edc83a7"],[["membership","sbx_v1_r2_scanner","postgres",{"bootstrapSuperuserOid":10}],"ff5d16bc44d039a021a44c565552cc162dbacc573b58f68a9ddbb0028a159fc7"],[["policy","sandbox_commerce_v1.r2_bindings","core_owner"],"ccb73c6b76a635d709769f2e18f7ad4e0bfd318a1374cb91d30d93a5dbf4d9b6"],[["policy","sandbox_commerce_v1.r2_commits","core_owner"],"74dd480c8af5f7291a2182299567c9c7d5e46905e31cc467b579babcbf4993e7"],[["policy","sandbox_commerce_v1.r2_dispatches","core_owner"],"5e253e93062a532364135399dbaa6f11869281db6859c512b960440911665466"],[["policy","sandbox_commerce_v1.r2_profiles","core_owner"],"78a025c1d3ff4fba67509e8507b4619da9922a85d4bf549a0a1855de41fdb4e8"],[["policy","sandbox_commerce_v1.r2_receipts","core_owner"],"424b90ef91108e02553198a312a19bada1185ed57fd94dc5d03f67d27c00185b"],[["policy","sandbox_commerce_v1.r2_tickets","core_owner"],"b7c230f2d8670203c8e22c0ac0ad2b511665c5d89c6c5b7b00768e1335603e74"],[["relation","sandbox_commerce_v1","r2_bindings"],"0df72a0a7701a5838678c387ecef9ffe1dc4cd10c4139bd3e397ccd5631cce8b"],[["relation","sandbox_commerce_v1","r2_commits"],"90b2b9d7ee347de470bad3f19aaf3939090f0e72f9319fff6580b531d8b43e8f"],[["relation","sandbox_commerce_v1","r2_dispatches"],"2bf386a93c277580aa6df09af0ac1baa84e504ca16e3ff4e102db95169d0d1d1"],[["relation","sandbox_commerce_v1","r2_profiles"],"b5cdeb53ede00dd5cd4ab0375eb0f3721b94be30bc116cd140962c23569ad963"],[["relation","sandbox_commerce_v1","r2_receipts"],"8d9dc77c4b6b84cab04104a8edd635ae4d31b0c8da60967ad2947ad338fec30f"],[["relation","sandbox_commerce_v1","r2_tickets"],"3c2b10b73b5e907de1cab256b5b73849a28c0eab984bb15a58dbbd6cbc43da50"],[["role","sbx_v1_r2_gateway"],"e12133b26f185b0537311875e5e5deb3f62551721aa99cfd89fd3923fd15bd89"],[["role","sbx_v1_r2_scanner"],"d3a44831c72a4d90e5186003a80813b5acc7891ec14c73999c68af356ab416fb"],[["schemaPrivilege","public","sbx_v1_r2_gateway","USAGE"],"4bd916e127b05b44b658d00e5f1f44fa133cdb96892b790af99c49adc7abe896"],[["schemaPrivilege","public","sbx_v1_r2_scanner","USAGE"],"0a6fc61420c1f52f8a0c9bd1c43af7c9beac9bae6e3c050f866b089357c65c7e"],[["trigger","sandbox_commerce_v1.paid_video_routes","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_noaction_del\"()",9],"e20d191a7be4d85093d3179b39d1bff42dd5c931cda434631f6ce68044325ec7"],[["trigger","sandbox_commerce_v1.paid_video_routes","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_noaction_upd\"()",17],"ce3ca4fd50c11ee604a5dd53529444e155a5b3f08212b239e1574b440ee5335d"],[["trigger","sandbox_commerce_v1.paid_video_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_noaction_del\"()",9],"1c4670713905cea2ad6bda6ef78a2e0d3af31d3717041770d36470b33ddcfd9d"],[["trigger","sandbox_commerce_v1.paid_video_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_noaction_upd\"()",17],"031018547ca59c868a5cc7e88060b88594cd9bd0bc2d9a9ad34eaa074232fddc"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"510197f3773fb9bdb1208566dc7a2766edc5e9b81f64a4cd557f58565081b88a"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"c5fc7efdcae5392b9402a9031bb1a40a6396475125d76f45d2071478822301f9"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"18d3668e38c9514ab448fa09d341a355db7b8b5c7a53fb99b6ea4145e2909ba8"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"f0195bb0de10a74d1871ffbff08c780a58386649c38427446773a93f9d2bad2e"],[["trigger","sandbox_commerce_v1.paid_video_uploads","typed_identity"],"c2b2872038fd22b6173ce7907be956e17ec3af3e25fa965bb51dede38c12851a"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_noaction_del\"()",9],"95d5e85d4e90d602bcc1d4babf1b3f5552aff8c57b0ec27b3d0a91eb0237f0bc"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_noaction_upd\"()",17],"8e2533ae16f2d95bb0cde1ff9d0cb5d3ebf709397e51c00e397da86a83f96d5d"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_noaction_del\"()",9],"e4f21d8e3c4294d5f6fbc56b337df7acb2e31ae701226fb80614025abcb03d22"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_noaction_upd\"()",17],"b2ae9e9d9c49740e755c11bde24f8eccaa126a479bdc1efa43ab35a60de1261c"],[["trigger","sandbox_commerce_v1.paid_video_workers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_noaction_del\"()",9],"93e7e33fe1fc7b9d650ceb14f5c316d945349a79f1f6e4dd11b2250528762ccb"],[["trigger","sandbox_commerce_v1.paid_video_workers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_noaction_upd\"()",17],"7b444f65f2b09249494b4cbb4c00ff02fcaf52ec908d1961b16da904a753f304"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_check_ins\"()",5],"0c6af1ebb70770806cd4c003935342283afe9a7e0ca659b7ff6f37e6a41c3ee6"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_check_upd\"()",17],"8680d2d8c74658ff65187f732cfcf6f0ae3026977418c423faa75d29a2acfc3d"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"2f65bc2cd8da9c9a5787dcaefe30735253157e068211af9b80ec852c6ecd0088"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"2b7e430c779cc2d4bb60bfe2d8c93d9ccb0b1944a3dce48ced2d89236455e294"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_noaction_del\"()",9],"0969cc4a59892ee1cb7a4d6e3e4da3dc6a941c30b8c5aeecece6a2df83b54649"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_noaction_upd\"()",17],"dedc3fea7e215160409e05f5be1fba32718fd5e4d3cb63fa601bae302f196d06"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_noaction_del\"()",9],"75976b3615e9f7e2a227e7af541dba09506ac4902b9450028c357fe9a2967d73"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_noaction_upd\"()",17],"3f98b921d86bd5a75e29e7be80c80ddd55795255050188c104cacc2207987abc"],[["trigger","sandbox_commerce_v1.r2_bindings","immutable"],"e3a78169b34cb42ada072516037442f57a696755b7d39415d3e7e9f7e8e48e49"],[["trigger","sandbox_commerce_v1.r2_bindings","immutable_truncate"],"b20b547ed8bfa4b3bd10cfc388fae6f30beb8050a66112be0858e2c1f5634247"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"71dca46a020963f11a15cba2faa46613f5aea2f80db73eb91b30440a5268e5b5"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"4a4b3f5b1c96ce491216671fecc7857bc1ac4cad48e30bf9785bab63cd46f9b5"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"acfb5a91d1b7c73852142471c7b09d2fa4df1ebee56ffbccb65ff1b32e4cdd69"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"f6f2fc31c2cf216f87cd9f7dd7c3697755d2a510a2c2f57b95011566219b9826"],[["trigger","sandbox_commerce_v1.r2_commits","immutable"],"8f8a34afc50a71989218db9ab82effb55f418f62d030e8a2c74b1f65e9047b40"],[["trigger","sandbox_commerce_v1.r2_commits","immutable_truncate"],"fbea81dee8a801e87b4cea52ebaa99cccdc56808dfc64887413509538063e71a"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"6164c1060e03daf11f190abd52347872e12bbb0ef91d279e8cbb1fa98ae682c7"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"de0432789ee7371ba95fad994f7a6de0d4262aefd62a412d479ed819e303f81d"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_check_ins\"()",5],"758f2a730765e2f5549031c29bf34125c0bc1a843d9ba94c3b87471c141ea702"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_check_upd\"()",17],"1473824a49096e7d9871422676a86af8ab9eb6f363e701c4f0b5def0167af3b9"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"f9ee0e83d955c342ec1184b9556dc6f53e5a69324f6cb85332cf55ed371df93c"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"43e203e5d52dc1a2cbc23374e6ecc7ecc93c96de0dfc1cb94479a8911985974d"],[["trigger","sandbox_commerce_v1.r2_dispatches","immutable"],"9c243e8a14c31d6d116653e8fc36df4ecceaabc35b4a91ca07cd3f1de4b49e5f"],[["trigger","sandbox_commerce_v1.r2_dispatches","immutable_truncate"],"0201e3e2cf27e23f4d16279c7fc6a1ffff132559f8d26f547c553fb1ab512ca5"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_noaction_del\"()",9],"1d35859c0bbe2bfb5e1deddea72900f20d484873041ca34c3dac0a820f8a7013"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_noaction_upd\"()",17],"e083a59459b8511dbad275ee79e38b01eadb253eefdc8be79f3baf2da7933747"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_check_ins\"()",5],"80d4941a6026de9719b008d0d1cf91e28859d0d07d87fd90f8e35111d7403cec"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_check_upd\"()",17],"5f515ce997304ddf0883bf1e72955fa389e7fa6aa21d6aa84ac496f03dd48436"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_check_ins\"()",5],"f23a262d3d3df3a51dc60bda1b86e788baddeb01bf57eac01ed5770f83a8af5b"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_check_upd\"()",17],"f27bef445d93fddc3c979993a842c3fe900f8901fbe953a8838df9b45048f606"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_check_ins\"()",5],"5cc38c417b8294bc12e82b0c8985d15117309e09caaf6d0584df4410af53283d"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_check_upd\"()",17],"01667647c55c7144ca47e6245cfb2295a124d2b4bf50d895413c5200993c597a"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_noaction_del\"()",9],"1d65ed7293b411ef8acf16654288b8c29c55b536332e480e4b08291fdc89b272"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_noaction_upd\"()",17],"80df1023374824abce3a900b1b4f5e9f4d8d33f6cc057075fe99ad36e10cad28"],[["trigger","sandbox_commerce_v1.r2_profiles","immutable"],"712fa70e809f00f1bc10378900c107160f8eea998095d3922a35b0082c18d133"],[["trigger","sandbox_commerce_v1.r2_profiles","immutable_truncate"],"9c43f27b5db575d8b34fa1f28e13c60fc6ef83ce8ce0d7fb9f8cd7c42de4df64"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_check_ins\"()",5],"2e28dc6ceb69ab0253629a988900f30fd1aabcb35a7632231ad44dbfc8563cdc"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_check_upd\"()",17],"18ec7005215362868f6cd6d3dee83aa006523654194e120ae5f40b84da360d3b"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"139870e7e1c4c9d644a456282eccbeebee51754851a835bdea5e1d868e4e8008"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"30f17688ee24f30de1722869e7be0b0cee56bc6d3c077d4d1d9f31ab51bf5ec5"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_check_ins\"()",5],"fc97270c4c3c00e63c6c4520490502c95881a3b446bb7959500950536e673ee9"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_check_upd\"()",17],"24cf43303f9832edb3036a54df81bd7166552d4e6b2a87f1465294fca524f984"],[["trigger","sandbox_commerce_v1.r2_receipts","immutable"],"ed3e293e64b3cb60729742f295c99fd3208af00c22f29de31570b7e4cca5af2e"],[["trigger","sandbox_commerce_v1.r2_receipts","immutable_truncate"],"9d0a62f98e9d35a0084887eb383fffdbf0fb56dfbb1beb843ea30cab89f4ffbb"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_check_ins\"()",5],"3b87e3bc229822a34cf891af8c41af5eaf6cb0554a476f3b15e4b9822d72f2c0"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_check_upd\"()",17],"6d3d62c4e9bdc4d4d7e1d100f4c97c4bc99530de304cdd1ce75c4724eab88ea2"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_check_ins\"()",5],"3c3ca45ed3aed45898913bb2afcc1de0e1b2007cbeed7dd1737aea35dc18b44b"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_check_upd\"()",17],"f454c2182f3eb019d3805ce93a90f4a70c6d69410642e8f89d3f651e27fe1502"],[["trigger","sandbox_commerce_v1.r2_tickets","immutable"],"7ec048f1df74d9db749ec5bd710f60816d4fd05900d58b322019e1d772e486b4"],[["trigger","sandbox_commerce_v1.r2_tickets","immutable_truncate"],"c767e77a51c591f8a0e66a65c4a89910ac999e9ee967f8d1dab279561a47c60e"],[["type","sandbox_commerce_v1","_r2_bindings"],"417132d5525ce078775dab899e08be49c72ec10246138e7f204d963ca77c7d71"],[["type","sandbox_commerce_v1","_r2_commits"],"6aa2d9617a5a9d2672c589f6a28622490bb20668aa0fe093abdbc250e9283b3b"],[["type","sandbox_commerce_v1","_r2_dispatches"],"0f2b4fe3298ccea0ab2d4fa189bfbaee7323df7156637daa45a7d232125c9499"],[["type","sandbox_commerce_v1","_r2_profiles"],"c502f6008d80983b4ca507f238475e693147b265ba9f00ee9082b1419859ac66"],[["type","sandbox_commerce_v1","_r2_receipts"],"369b6eb6d8309f22980a75fef7edf11b146614ba5123fb719cd83ebae53cfa99"],[["type","sandbox_commerce_v1","_r2_tickets"],"b64d6bde45622dc86fed367f67b6f338f8d792766d9937d74e77c49257acfd9e"],[["type","sandbox_commerce_v1","r2_bindings"],"fab585c25c39e1bdadd1b26c1b0a02ae4b1ef7a31e5fe764be7081734d4c1acd"],[["type","sandbox_commerce_v1","r2_commits"],"386efbd94ed1689a49462f9cdae1e2b35eb821e084bcc2700a11e48891058797"],[["type","sandbox_commerce_v1","r2_dispatches"],"2ed4f8013ac483398d815e1da2b19b50d39005e5b6f54a0ca7d3868296f06bdb"],[["type","sandbox_commerce_v1","r2_profiles"],"983c21831303a9c784335d1f9c6c2f0b96e75f7cf909747ed569fbae2ddd305e"],[["type","sandbox_commerce_v1","r2_receipts"],"8c4c6fbc48c8e08f0e26683b9cda0a10d57e54966bfafac330c6b546d5d455f3"],[["type","sandbox_commerce_v1","r2_tickets"],"f7b5fc221d8c1e15ee150f57b0f2c310241580d50c75cb2d543b407db984f7d3"]]'::jsonb)),
 allowed_changed as materialized(select value->0 k,value->>1 before_h,value->>2 after_h from jsonb_array_elements('[[["column","sandbox_commerce_v1.delivery_asset_scans","object_version"],"4bd946529341db0cd54c5db42d4ca9d0d0f5afb61491ad55a1bcef8bdb63cf0c","a391d9543aa8fc378cb74189fd5a4a6de0ce9c90d93226d9f77e5d1b99b8fe6c"],[["column","sandbox_commerce_v1.delivery_assets","object_version"],"3ecf1eb20dce4a9fe5489ff591cd05367276ed20e5d6229ad0dd8b9f1f57f099","b77a6aa106e2c88956ffabf76220aa7089656150277bec4d1ad7b437e8e70669"],[["function","sandbox_commerce_v1","clean_resource_asset","p_id uuid, p_resource uuid, p_revision bigint, p_owner uuid, p_purpose text"],"ca4b1cee1b53cd4743f3bb8e168ad53cfd776c9c0b10159df314528233e5ff92","97c7de17a26160b92c310e280088a85eba230d396b4ae32551851f123bb4a0ac"],[["function","sandbox_commerce_v1","native_store_apply_effect_pre_play_handoff","p_raw_receipt_id uuid, p_claim_id uuid, p_protocol_id uuid, p_protocol_revision bigint, p_projection jsonb"],"1ab63ed2668ed5b7fac836cf588b0c0fad5f3e23230cffd718cb97b55d84b554","cd8b3c2b1c60eb33197248ecae5a80a52864c58c38a250112c9bdac5a6564126"],[["function","sandbox_commerce_v1","native_store_paid_video_access","p_user uuid, p_session uuid, p_resource uuid, p_grant uuid"],"8b8d609805b6f558fdc3c3c2af208f83f4881e7b8d384d586ee374cb178cd07a","90fb6efc22fcc4ac9a6c4e86f85eb2f4e6d03be5b7a0fe9461452dc13b6b1c7a"],[["function","sandbox_commerce_v1","native_store_play_apply_effect","p_raw_receipt_id uuid, p_claim_id uuid, p_protocol_id uuid, p_protocol_revision bigint, p_projection jsonb"],"749371b325a200b1c28bf9d70ecdd8b6194d010c7d55d3b7f213af47f1d199ce","d8d9990b16b6d9f0037d665c396525ee98fbe7b595019d296cb5a0c8ddf79127"],[["function","sandbox_commerce_v1","native_store_quote_command_armed","p_user uuid, p_session uuid, p_command text, p_request uuid, p_payload jsonb"],"3a000029343ae665e0a384c229e2bb05851f30b93fddfd585887f48b8c20394e","b856353df69508ea4064ff5a5ccf71ffd382b5a5843d3b3547c0a94e002e263e"],[["function","sandbox_commerce_v1","paid_video_command_v2","p_command text, p_payload jsonb, p_user uuid, p_session uuid, p_configuration text"],"de8a90636bf6e18c5f5ff5bc45dcebe2a9b852f4bf5166f43e8821ea32317cf7","9ec8ef7a8a57ab399f9bb779abc3e943b14caa84087a637f16dd5d5e1f3052a2"],[["function","sandbox_commerce_v1","paid_video_gateway_ready","p_configuration text, p_route uuid"],"e1479d9a3eb4e926977a5e0a9909b2747d57f0c8112b6ccdfd200e8cf1d20157","21e78f8b1a0bf2f117bb693dd4be78ee0383aceaf1f234f33f2a625cba8b8672"],[["function","sandbox_commerce_v1","paid_video_native_command","p_command text, p_payload jsonb, p_expected_account_id uuid, p_expected_session_generation uuid"],"be7a41f5a969f65bf9d145d46e23f14f67d15c55124d07ba5ae239c2f07515cc","a74ac3ffa2ea96dfcaabc90caad6d0919e9e240a9783f5df181b1f73da0e96ae"],[["function","sandbox_commerce_v1","paid_video_review","p_action text, p_raw text"],"61ea43b0deb56290a335cca41210d58e27d3244fd24cee069c69a24e593fe340","406152808a07a63fb26e86381c4dcb68d5c5cc3f46ac91a384dff5bb0cf1cef7"],[["function","sandbox_commerce_v1","paid_video_review_snapshot","p_upload uuid"],"ad8a07c054adee1b40336415a0cfaf37fab931d98d3b4559f985eeb5be267ada","532e9f069041514e66d9825fe5123771ea721702dc729740e2835eed8fb9078e"],[["trigger","sandbox_commerce_v1.paid_video_uploads","identity_immutable"],"f2a58a9fb1605530204dd7cd2453aea477db226304dc45c234483b3f20fd8a3d","d44de0c5815890a6fb720d1882a42eeeac55c49e9d5dd02ab3380c0b978c6c90"]]'::jsonb)),
 raw as materialized(
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and p.prokind in('f','p')
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in('v','m') then pg_get_viewdef(c.oid,true) end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and c.relkind in('r','p','v','m','S')
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')
 union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname,pg_get_constraintdef(co.oid),co.convalidated) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('index',i.indrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text collate "C") from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname,t.tgisinternal,t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid),co.conrelid::regclass::text,co.conname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig) from pg_roles
 union all select jsonb_build_array('membership',m.roleid::regrole::text,m.member::regrole::text,case when m.roleid in(select oid from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=10
 and exists(select 1 from pg_roles where oid=10 and rolsuper)
 and m.admin_option and not m.inherit_option and not m.set_option
 then jsonb_build_object('bootstrapSuperuserOid',10) else to_jsonb(m.grantor::regrole::text) end,m.admin_option,m.inherit_option,m.set_option) from pg_auth_members m
 union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype,defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('eventTrigger',e.evtname,e.evtevent,e.evtenabled,e.evttags,e.evtowner::regrole::text,pg_get_functiondef(e.evtfoid),p.proacl::text,p.proowner::regrole::text) from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
 union all select jsonb_build_array('type',n.nspname,t.typname,t.typtype,t.typcategory,t.typowner::regrole::text,t.typnotnull,t.typdefault,case when t.typrelid=0 then null else t.typrelid::regclass::text end,case when t.typelem=0 then null else format_type(t.typelem,null) end,case when t.typbasetype=0 then null else format_type(t.typbasetype,t.typtypmod) end,case when t.typcollation=0 then null else t.typcollation::regcollation::text end,t.typacl::text) item from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('columnMetadata',a.attrelid::regclass::text,a.attname,a.attnum,case when a.attcollation=0 then null else a.attcollation::regcollation::text end,a.attstorage,a.attcompression,a.attoptions,a.attfdwoptions) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and c.relkind in('r','p','v','m','S') and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('sequence',s.seqrelid::regclass::text,format_type(s.seqtypid,null),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle) from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('enum',n.nspname,t.typname,e.enumsortorder,e.enumlabel) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') union all select jsonb_build_array('schemaPrivilege','public',g.rolname,'USAGE',false,'<schema-owner>')
 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 join pg_roles g on g.oid=a.grantee where n.nspname='public' and g.rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner')
 and a.grantor=n.nspowner and a.privilege_type='USAGE' and not a.is_grantable limit 60001),
 acls as materialized(select distinct k,v from (
 select 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1','public') and p.prokind in('f','p')
 union all select 'relation:'||n.nspname||'.'||c.relname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1') and c.relkind in('r','p','v','m','S')
 union all select 'schema:'||n.nspname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) from pg_namespace n where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1')
 union all select 'column:'||a.attrelid::regclass::text||'.'||a.attname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(a.attacl) a) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1') and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')
  union all select 'schema:'||n.nspname k,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type collate "C",a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) v from pg_namespace n where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select 'type:'||n.nspname||'.'||t.typname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type collate "C",a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) a) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')) a),
 acl_keyed as materialized(select item r,case item->>0
 when 'function' then 'function:'||(item->>1)||'.'||(item->>2)||'('||(item->>3)||')'
 when 'relation' then 'relation:'||(item->>1)||'.'||(item->>2)
 when 'column' then 'column:'||(item->>1)||'.'||(item->>2)
 when 'schema' then 'schema:'||(item->>1)
 when 'type' then 'type:'||(item->>1)||'.'||(item->>2) end acl_k,
 case item->>0 when 'schema' then 3 when 'type' then 12 else 5 end acl_i from raw),
 acl_normalized as materialized(select case when a.v is null then r else jsonb_set(r,array[acl_i::text],a.v) end r from acl_keyed left join acls a on a.k=acl_k),
 normalized as materialized(select case when r->>0='schema' and r->>1='public' then
 jsonb_set(r,'{3}',(select coalesce(jsonb_agg(v order by ord),'[]'::jsonb) from jsonb_array_elements(r->3) with ordinality a(v,ord)
  where not(v->>0=r->>2 and v->>1 in('sbx_v1_r2_gateway','sbx_v1_r2_scanner') and v->>2='USAGE' and v->3='false'::jsonb)))
 when r->>0='trigger' and r->3='true'::jsonb then
 jsonb_set(jsonb_set(r,'{2}','"<internal>"'),'{9}',to_jsonb(regexp_replace(r->>9,'RI_ConstraintTrigger_[ac]_[0-9]+','RI_ConstraintTrigger_<internal>','g'))) else r end r from acl_normalized),
 measured as materialized(select r,encode(sha256(convert_to(r::text,'UTF8')),'hex') h,case r->>0
 when 'function' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'schemaPrivilege' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'constraint' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'membership' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'defaultAcl' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'index' then jsonb_build_array(r->0,r->1,substring(r->>2 from '^CREATE (?:UNIQUE )?INDEX (.+?) ON '))
 when 'trigger' then case when r->3='true'::jsonb then jsonb_build_array(r->0,r->1,r->2,r->10,r->11,r->4,r->5) else jsonb_build_array(r->0,r->1,r->2) end
 when 'enum' then jsonb_build_array(r->0,r->1,r->2,r->4)
 when 'column' then jsonb_build_array(r->0,r->1,r->2)
 when 'columnMetadata' then jsonb_build_array(r->0,r->1,r->2)
 when 'policy' then jsonb_build_array(r->0,r->1,r->2)
 when 'type' then jsonb_build_array(r->0,r->1,r->2)
 when 'relation' then jsonb_build_array(r->0,r->1,r->2)
 else jsonb_build_array(r->0,r->1) end k from normalized),oids as materialized(select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) k,p.oid::text v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and p.prokind in('f','p')
 union all select case when c.relkind in('i','I') then jsonb_build_array('index',i.indrelid::regclass::text,c.relname) else jsonb_build_array('relation',n.nspname,c.relname) end,c.oid::text from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_index i on i.indexrelid=c.oid where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname),co.oid::text from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select case when t.tgisinternal then jsonb_build_array('trigger',t.tgrelid::regclass::text,'<internal>',co.conrelid::regclass::text,co.conname,t.tgfoid::regprocedure::text,t.tgtype) else jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname) end,t.oid::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('type',n.nspname,t.typname),t.oid::text from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname),p.oid::text from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('schema',n.nspname),n.oid::text from pg_namespace n where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('role',r.rolname),r.oid::text from pg_roles r
 union all select jsonb_build_array('membership',m.roleid::regrole::text,m.member::regrole::text,case when m.roleid in(select oid from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=10
 and exists(select 1 from pg_roles where oid=10 and rolsuper)
 and m.admin_option and not m.inherit_option and not m.set_option
 then jsonb_build_object('bootstrapSuperuserOid',10) else to_jsonb(m.grantor::regrole::text) end),m.oid::text from pg_auth_members m
 union all select jsonb_build_array('eventTrigger',evtname),oid::text from pg_event_trigger
 union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype),d.oid::text from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname),d.oid::text from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') limit 35001),history as materialized(select version,name,created_by,idempotency_key,statements,rollback,case when cardinality(statements) between 1 and 1024 and array_ndims(statements)=1 and array_lower(statements,1)=1 then (select coalesce(bool_and(s is not null and octet_length(s)<=8388608),false) and coalesce(sum(octet_length(s)),0)<=16777216 from unnest(statements) s) else false end statement_safe,case when rollback is null then true when cardinality(rollback) between 0 and 256 and (cardinality(rollback)=0 or array_ndims(rollback)=1) then (select coalesce(bool_and(s is not null and octet_length(s)<=8388608),true) and coalesce(sum(octet_length(s)),0)<=16777216 from unnest(rollback) s) else false end rollback_safe,octet_length(version)<=64 and (name is null or octet_length(name)<=4096) and(created_by is null or octet_length(created_by)<=4096) and(idempotency_key is null or octet_length(idempotency_key)<=4096) metadata_safe from (select version,name,created_by,idempotency_key,statements,rollback from supabase_migrations.schema_migrations order by version collate "C" limit 2501) bounded_history)
 select jsonb_build_object(
 'protocol','r2-forward-observation-v1','source','39378202a8e677dd3c01eb71a96ab9ceb5525de3','tree','f39edb815fa4ffeb53eff32ba85f67415fb074db','extensionDigest','55ed69aab2b2e3991fbf37542e82985141e85bdbc15028487054fc325847c4de',
 'context',jsonb_build_object('currentUser',current_user,'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'serverVersionNum',current_setting('server_version_num')),
 'capturedAt',clock_timestamp(),'snapshot',pg_current_snapshot()::text,'database',current_database(),'serverStartedAt',pg_postmaster_start_time(),
 'roleSafety',(select count(*)=1 and bool_and(not rolsuper) from pg_roles where rolname='postgres')
 and (select count(*)=2 and bool_and(not rolsuper and not rolcanlogin and not rolcreaterole and not rolcreatedb and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner'))
 and (select count(*)=1 and bool_and(not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication) from pg_roles where rolname='supabase_read_only_user'),
 'historyBoundarySafe',(select count(*)=1 and bool_and(c.relowner='postgres'::regrole and c.relkind='r' and c.relpersistence='p' and not c.relrowsecurity and not c.relforcerowsecurity) from pg_class c where c.oid='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_trigger where tgrelid='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_rewrite where ev_class='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_attrdef where adrelid='supabase_migrations.schema_migrations'::regclass)
 and (select count(*)=6 and bool_and(not attisdropped and attidentity='' and attgenerated='' and case when attname in('statements','rollback') then atttypid='text[]'::regtype when attname in('version','name','created_by','idempotency_key') then atttypid='text'::regtype else false end) from pg_attribute where attrelid='supabase_migrations.schema_migrations'::regclass and attnum>0)
 and (select count(*)=2 and bool_and(convalidated) and count(*) filter(where pg_get_constraintdef(oid)='PRIMARY KEY (version)')=1 and count(*) filter(where pg_get_constraintdef(oid)='UNIQUE (idempotency_key)')=1 from pg_constraint where conrelid='supabase_migrations.schema_migrations'::regclass),
 'withinBounds',(select count(*)<=60000 from raw) and (select count(*)<=35000 from oids) and (select count(*)<2501 and coalesce(bool_and(statement_safe and rollback_safe and metadata_safe),false) from history) and (select count(*)<2501 and coalesce(sum(cardinality(statements)),0)<=20000 from history) and (select count(*)<25001 from(select 1 from public.platform_money_kill_switches limit 25001) bounded_money),
 'catalogCount',(select count(*) from measured),'catalogSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select r from measured limit 60001) h(item)),
 'retainedCount',(select count(*) from measured m where not exists(select 1 from allowed_added a where a.k=m.k) and not exists(select 1 from allowed_changed c where c.k=m.k)),
 'retainedSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select r from measured m where not exists(select 1 from allowed_added a where a.k=m.k) and not exists(select 1 from allowed_changed c where c.k=m.k) limit 60001) h(item)),
 'retainedOidSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select jsonb_build_array(o.k,o.v) from oids o where not exists(select 1 from jsonb_array_elements('[["trigger","sandbox_commerce_v1.paid_video_uploads","identity_immutable"]]'::jsonb) x where x.value=o.k) and not exists(select 1 from allowed_added a where a.k=o.k) limit 35001) h(item)),
 'allOidSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select jsonb_build_array(k,v) from oids limit 35001) h(item)),
 'duplicateKeys',(select count(*) from(select k from measured group by k having count(*)<>1) d),
 'ambiguousACLs',(select count(*) from(select k from acls group by k having count(*)<>1) a),
 'addedPresent',(select count(*) from measured m join allowed_added a using(k)),
 'beforeChangedExact',(select count(*)=13 and count(m.h)=13 and bool_and(m.h=c.before_h) from allowed_changed c left join measured m using(k)),
 'afterChangedExact',(select count(*)=13 and count(m.h)=13 and bool_and(m.h=c.after_h) from allowed_changed c left join measured m using(k)),
 'addedExact',(select count(*)=252 and count(m.h)=252 and bool_and(m.h=a.h) from allowed_added a left join measured m using(k)),
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'historySha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select case when metadata_safe then jsonb_build_array(version,name,jsonb_build_array(created_by,idempotency_key,array_ndims(rollback),array_lower(rollback,1),cardinality(rollback),case when rollback_safe and rollback is not null then encode(sha256(convert_to(array_to_json(rollback)::text,'UTF8')),'hex') else null end),array_ndims(statements),array_lower(statements,1),cardinality(statements),case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') else null end) else null end from history limit 25001) h(item)),
 'predecessorReceiptsExact',(select count(*)=2 and bool_and(name=case version when '20261110021153' then 'revenuecat_native_legacy_exclusion_v1' else 'native_store_play_handoff_settlement_v1' end and cardinality(statements)=1 and array_ndims(statements)=1 and array_lower(statements,1)=1 and case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')=case version when '20261110021153' then 'db5be54c1757ea8a487d446715f344b11a486497b67c5198d511ed240167499b' else '34e9e2dc1569ea4ba1e0f4f746869071f959a24540a22d6e91130207e49ea771' end else false end) from history where version in('20261110021153','20261110021650')) and (select count(*)=1 and bool_and(name='native_paid_video_authoring_operations_v1' and cardinality(statements)=1 and array_ndims(statements)=1 and array_lower(statements,1)=1 and case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')='af9e35e0ce2bfd0b2e644f34d46cfb805ab662c898faabcd7505e1ec0e50ba85' else false end) from history where version='20261110060000'),
 'baseReceiptExact',(select count(*)=1 and bool_and(name='native_store_sandbox_source_bound_48' and array_ndims(statements)=1 and array_lower(statements,1)=1 and cardinality(statements)=1 and case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')='d5a54d9ea772952f72d3ccc53449a788d4a0dec51aafc116b4a1af0c71f01ff9' else false end) from history where version='20261109151349'),
 'historyReceipts',(select coalesce(jsonb_agg(case when metadata_safe then jsonb_build_object('version',version,'name',name,'metadataSha256',case when rollback_safe then encode(sha256(convert_to(jsonb_build_array(created_by,idempotency_key,array_ndims(rollback),array_lower(rollback,1),cardinality(rollback),case when rollback_safe and rollback is not null then encode(sha256(convert_to(array_to_json(rollback)::text,'UTF8')),'hex') else null end)::text,'UTF8')),'hex') else null end,'extraMetadataNull',created_by is null and idempotency_key is null and rollback is null,'statementsCount',cardinality(statements),'arrayDimensions',array_ndims(statements),'arrayLower',array_lower(statements,1),'statementArraySha256',case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') else null end,'statementHashes',case when statement_safe then (select coalesce(jsonb_agg(encode(sha256(convert_to(s,'UTF8')),'hex') order by ord),'[]'::jsonb) from unnest(statements) with ordinality u(s,ord)) else null end) else null end order by version collate "C"),'[]'::jsonb) from history where (select count(*)<2501 and coalesce(sum(cardinality(statements)),0)<=20000 from history)),
 'moneyControlsSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select jsonb_build_array(key,state) from public.platform_money_kill_switches limit 25001) h(item)),
 'moneyHeld',(select count(*)=9 and bool_and(state=case when key in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end) from public.platform_money_kill_switches where key in('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled')),
 'ownerPrivilegesRestored',not has_schema_privilege('sbx_v1_core_owner','public','CREATE') and not has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') and not exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)),
 'currentPrivateRuntimeState','UNQUALIFIED','retryAllowed',false,'deploymentAllowed',false,'activationAllowed',false) state;
do $fresh$ declare observed jsonb;begin
 select state into strict observed from r2_forward_before;
 if not (observed->>'historyBoundarySafe')::boolean or not (observed->>'withinBounds')::boolean or not (observed->>'beforeChangedExact')::boolean or (observed->>'addedPresent')::int<>0
 or not (observed->>'baseReceiptExact')::boolean or not (observed->>'predecessorReceiptsExact')::boolean or not (observed->>'moneyHeld')::boolean
 or (observed->>'duplicateKeys')::int<>0 or (observed->>'ambiguousACLs')::int<>0
 then raise exception 'r2_deployment_not_fresh';end if;
 if (observed->>'historyMaximum')>='20261110120025' then raise exception 'r2_history_order_invalid';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261110120025' or name='native_paid_video_r2_bounded_v1') then raise exception 'r2_history_collision';end if;
end $fresh$;
-- Journal is independently observed using its existing bounded reader.
 -- No new journal-owner membership or direct journal read grant is introduced.
 grant sbx_v1_core_owner to postgres with inherit false,set true;
 set local role sbx_v1_core_owner;
 lock table sandbox_commerce_v1.native_store_play_handoff_control,sandbox_commerce_v1.lifecycle,sandbox_commerce_v1.native_store_quote_controls,sandbox_commerce_v1.paid_video_gateway_controls,sandbox_commerce_v1.test_store_controls,sandbox_commerce_v1.test_store_v2_controls,sandbox_commerce_v1.test_store_v3_controls,sandbox_commerce_v1.test_store_qualification_controls,sandbox_commerce_v1.native_store_catalog_bindings,sandbox_commerce_v1.native_store_catalog_retirements,sandbox_commerce_v1.native_store_selections,sandbox_commerce_v1.native_store_claims,sandbox_commerce_v1.native_store_reservations,sandbox_commerce_v1.native_store_dispatch_attempts,sandbox_commerce_v1.native_store_core_links,sandbox_commerce_v1.native_store_pending_raw,sandbox_commerce_v1.native_store_protocol_qualifications,sandbox_commerce_v1.native_store_protocol_revocations,sandbox_commerce_v1.native_store_qualified_attempts,sandbox_commerce_v1.native_store_settlement_protocols,sandbox_commerce_v1.native_store_settlement_revocations,sandbox_commerce_v1.native_store_negative_tombstones,sandbox_commerce_v1.native_store_allocations,sandbox_commerce_v1.native_store_raw_effects,sandbox_commerce_v1.native_store_reservation_terminals,sandbox_commerce_v1.resources,sandbox_commerce_v1.resource_versions,sandbox_commerce_v1.resource_bindings,sandbox_commerce_v1.catalog,sandbox_commerce_v1.offers,sandbox_commerce_v1.intents,sandbox_commerce_v1.requests,sandbox_commerce_v1.receipts,sandbox_commerce_v1.receipt_events,sandbox_commerce_v1.transaction_owners,sandbox_commerce_v1.grants,sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds,sandbox_commerce_v1.delivery_assets,sandbox_commerce_v1.delivery_asset_scans,sandbox_commerce_v1.video_terms,sandbox_commerce_v1.paid_video_routes,sandbox_commerce_v1.paid_video_workers,sandbox_commerce_v1.paid_video_uploads,sandbox_commerce_v1.paid_video_tickets,sandbox_commerce_v1.paid_video_scan_results,sandbox_commerce_v1.paid_video_moderation,sandbox_commerce_v1.paid_video_requests,sandbox_commerce_v1.paid_video_catalog,sandbox_commerce_v1.paid_video_transfers,sandbox_commerce_v1.paid_video_verifiers,sandbox_commerce_v1.paid_video_object_receipts,sandbox_commerce_v1.paid_video_gateway_requests,sandbox_commerce_v1.paid_video_gateway_transfers,sandbox_commerce_v1.paid_video_receipt_links,sandbox_commerce_v1.native_store_play_handoff_setups,sandbox_commerce_v1.native_store_play_setup_revocations,sandbox_commerce_v1.native_store_play_enrollments,sandbox_commerce_v1.native_store_play_enrollment_revocations,sandbox_commerce_v1.native_store_play_handoff_attempts,sandbox_commerce_v1.native_store_play_settlement_protocols,sandbox_commerce_v1.native_store_play_settlement_revocations,sandbox_commerce_v1.native_store_play_allocations,sandbox_commerce_v1.native_store_play_raw_effects,sandbox_commerce_v1.paid_video_native_authoring_profiles,sandbox_commerce_v1.paid_video_native_catalog_templates,sandbox_commerce_v1.paid_video_native_template_retirements,sandbox_commerce_v1.paid_video_native_publications,sandbox_commerce_v1.paid_video_operations_config,sandbox_commerce_v1.paid_video_operations_requests,sandbox_commerce_v1.paid_video_reviewers,sandbox_commerce_v1.paid_video_reviews,sandbox_commerce_v1.paid_video_removals in share row exclusive mode nowait;
 do $core_state$ begin
 if not (select count(*)=1 and bool_and(singleton and (not enabled)) from sandbox_commerce_v1.native_store_play_handoff_control) then raise exception 'authoring_control_not_disabled:native_store_play_handoff_control';end if;
if not (select count(*)=1 and bool_and(singleton and (state='disabled')) from sandbox_commerce_v1.lifecycle) then raise exception 'authoring_control_not_disabled:lifecycle';end if;
if not (select count(*)=1 and bool_and(singleton and (not preparation_enabled)) from sandbox_commerce_v1.native_store_quote_controls) then raise exception 'authoring_control_not_disabled:native_store_quote_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not enabled and route_id is null and verifier_id is null and worker_id is null and qualification_sha256 is null)) from sandbox_commerce_v1.paid_video_gateway_controls) then raise exception 'authoring_control_not_disabled:paid_video_gateway_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not ingress_enabled and not initiation_enabled and connection_id is null and connection_revision is null)) from sandbox_commerce_v1.test_store_controls) then raise exception 'authoring_control_not_disabled:test_store_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null)) from sandbox_commerce_v1.test_store_v2_controls) then raise exception 'authoring_control_not_disabled:test_store_v2_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null)) from sandbox_commerce_v1.test_store_v3_controls) then raise exception 'authoring_control_not_disabled:test_store_v3_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (phase='disabled' and connection_id is null and connection_revision is null and started_at is null and sealed_at is null and seal_sha256 is null)) from sandbox_commerce_v1.test_store_qualification_controls) then raise exception 'authoring_control_not_disabled:test_store_qualification_controls';end if;
 if not (not exists(select 1 from sandbox_commerce_v1.native_store_catalog_bindings limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_catalog_bindings';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_catalog_retirements';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_selections limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_selections';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_claims limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_claims';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_reservations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_reservations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_dispatch_attempts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_core_links limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_core_links';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_pending_raw';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_protocol_qualifications limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_protocol_qualifications';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_protocol_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_qualified_attempts limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_qualified_attempts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_settlement_protocols limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_settlement_protocols';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_settlement_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_negative_tombstones limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_negative_tombstones';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_allocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_allocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_raw_effects';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_reservation_terminals';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resources limit 1)) then raise exception 'authoring_old_native_not_empty:resources';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_versions limit 1)) then raise exception 'authoring_old_native_not_empty:resource_versions';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_bindings limit 1)) then raise exception 'authoring_old_native_not_empty:resource_bindings';end if;
if not (not exists(select 1 from sandbox_commerce_v1.catalog limit 1)) then raise exception 'authoring_old_native_not_empty:catalog';end if;
if not (not exists(select 1 from sandbox_commerce_v1.offers limit 1)) then raise exception 'authoring_old_native_not_empty:offers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.intents limit 1)) then raise exception 'authoring_old_native_not_empty:intents';end if;
if not (not exists(select 1 from sandbox_commerce_v1.requests limit 1)) then raise exception 'authoring_old_native_not_empty:requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.receipts limit 1)) then raise exception 'authoring_old_native_not_empty:receipts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.receipt_events limit 1)) then raise exception 'authoring_old_native_not_empty:receipt_events';end if;
if not (not exists(select 1 from sandbox_commerce_v1.transaction_owners limit 1)) then raise exception 'authoring_old_native_not_empty:transaction_owners';end if;
if not (not exists(select 1 from sandbox_commerce_v1.grants limit 1)) then raise exception 'authoring_old_native_not_empty:grants';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_grants limit 1)) then raise exception 'authoring_old_native_not_empty:resource_grants';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_delivery_holds limit 1)) then raise exception 'authoring_old_native_not_empty:resource_delivery_holds';end if;
if not (not exists(select 1 from sandbox_commerce_v1.delivery_assets limit 1)) then raise exception 'authoring_old_native_not_empty:delivery_assets';end if;
if not (not exists(select 1 from sandbox_commerce_v1.delivery_asset_scans limit 1)) then raise exception 'authoring_old_native_not_empty:delivery_asset_scans';end if;
if not (not exists(select 1 from sandbox_commerce_v1.video_terms limit 1)) then raise exception 'authoring_old_native_not_empty:video_terms';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_routes limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_routes';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_workers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_workers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_uploads limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_uploads';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_tickets limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_tickets';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_scan_results limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_scan_results';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_moderation limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_moderation';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_requests limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_catalog limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_catalog';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_transfers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_transfers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_verifiers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_verifiers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_object_receipts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_gateway_requests limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_gateway_requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_gateway_transfers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_gateway_transfers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_receipt_links limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_receipt_links';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_setups limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_handoff_setups';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_setup_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollments limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_enrollments';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_enrollment_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_attempts limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_handoff_attempts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_protocols limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_settlement_protocols';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_settlement_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_allocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_allocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_raw_effects';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_authoring_profiles';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_catalog_templates';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_template_retirements limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_template_retirements';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_publications limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_publications';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_operations_config limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_operations_config';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_operations_requests limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_operations_requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_reviewers limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_reviewers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_reviews limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_reviews';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_removals limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_removals';end if;
 end $core_state$;
 reset role;grant sbx_v1_core_owner to postgres with inherit false,set false;
 do $restored$ begin if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') or exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)) then raise exception 'authoring_owner_interval_leaked';end if; end $restored$;
-- BEGIN EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/deployment-grant.sql sha256=f3baacb85a768be8a4b3f578a3a9282cab4301ce4cf0c8ff9df18387fe8024f3
-- Exact transaction-only owner interval; no original installer replay.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
 or current_setting('transaction_isolation')<>'repeatable read'
 or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 or exists(select 1 from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 then raise exception 'r2_forward_owner_interval_required';end if;
end $$;
-- R2 source resets to postgres before owned wrapper ACLs; restore both rights
-- after the fixed source and verify final catalog/memberships before commit.
grant sbx_v1_core_owner to postgres with inherit true,set true;
grant create on schema public to sbx_v1_core_owner;
-- END EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/deployment-grant.sql

-- BEGIN EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/source.sql sha256=832712fcc47d9ecfcff8b3012b6bdd045d7461357ae4b3e50af1aded1e3a25e7
-- Studio predecessor; all money and provider controls remain unchanged.
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_gateway_ready(text,uuid)'::regprocedure) is distinct from 'b5580c7c47a11a89ca5d8440c36decec0083db34ef54a9d28a3dfacaf1c8bc84' then raise exception 'r2_predecessor_function_drift:paid_video_gateway_ready';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_native_command(text,jsonb,uuid,uuid)'::regprocedure) is distinct from 'd021df5ade1099e190bc70bad2e1a6de40bb8c8128287d73df8f9d7ad79135fb' then raise exception 'r2_predecessor_function_drift:paid_video_native_command';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_command_v2(text,jsonb,uuid,uuid,text)'::regprocedure) is distinct from '9b89ea4978563b1042ad4823fec4984c192a363b819d1ea6167457b439e568f3' then raise exception 'r2_predecessor_function_drift:paid_video_command_v2';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.clean_resource_asset(uuid,uuid,bigint,uuid,text)'::regprocedure) is distinct from 'a170b9599a336fc4026274361d22586134f81ccc7ab0a85a0f22efbb1651a448' then raise exception 'r2_predecessor_function_drift:clean_resource_asset';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_quote_command_armed(uuid,uuid,text,uuid,jsonb)'::regprocedure) is distinct from 'd9fc3c605cbb0034f892014cf6b277501a687aae3906ca169ac567b8ef3f0006' then raise exception 'r2_predecessor_function_drift:native_store_quote_command_armed';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(uuid,uuid,uuid,bigint,jsonb)'::regprocedure) is distinct from 'c8a02d7e8038b488ef1d7c9e86f109adb16838f0c6edebbfa4ce8147a9f74e39' then raise exception 'r2_predecessor_function_drift:native_store_apply_effect_pre_play_handoff';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_play_apply_effect(uuid,uuid,uuid,bigint,jsonb)'::regprocedure) is distinct from 'f0c1787021d744bb1aa088c133efdaf3671c268774a85d810dc5182d20ab495b' then raise exception 'r2_predecessor_function_drift:native_store_play_apply_effect';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_paid_video_access(uuid,uuid,uuid,uuid)'::regprocedure) is distinct from '90d62544e634ced0a777611f9bd05ae56a9b4f5df10ae71ecc508b109b814f8e' then raise exception 'r2_predecessor_function_drift:native_store_paid_video_access';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_review_snapshot(uuid)'::regprocedure) is distinct from 'dd5437954e87fb3a510dec602c004443bf3f887a5bddeea5dc4c103f4d4ff330' then raise exception 'r2_predecessor_function_drift:paid_video_review_snapshot';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_review(text,text)'::regprocedure) is distinct from '9ff49cde24ed835bc0801e771ad89993ee9e2738c940921eb72bbca47535606c' then raise exception 'r2_predecessor_function_drift:paid_video_review';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_apply_effect(uuid,uuid,uuid,bigint,jsonb)'::regprocedure) is distinct from '555264ae01c5e07a56d772b0f41b04cfd4c8327ce5a1ad3e55e125aa54feab88' then raise exception 'r2_predecessor_function_drift:native_store_apply_effect';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_assert_current_allocation(uuid,uuid)'::regprocedure) is distinct from '2c370f63c15c503f3f7a5fe9c94e1f1f4e7a0e7b1470e2827518e0c201a3a823' then raise exception 'r2_predecessor_function_drift:native_store_assert_current_allocation';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_settlement_protocol(uuid,bigint)'::regprocedure) is distinct from '44fdfd7860638e6e2ca861708277eb39a289ff339fa025bfcb4fab6bdfd890d3' then raise exception 'r2_predecessor_function_drift:native_store_settlement_protocol';end if;end $guard$;
-- Forward-only typed R2 extension. Source/local proof only. No seeds, activation,
-- credentials, provider installation, or changes to frozen predecessor sources.
create role sbx_v1_r2_gateway nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role sbx_v1_r2_scanner nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_identity_valid(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& array['kind','nativeVersion','etag']
  and (v-array['kind','nativeVersion','etag'])='{}'::jsonb and v->>'kind'='r2-native-upload-v1'
  and jsonb_typeof(v->'nativeVersion')='string' and v->>'nativeVersion' ~ '^[!-~]+$' and octet_length(v->>'nativeVersion') between 1 and 1024
  and jsonb_typeof(v->'etag')='string' and v->>'etag' ~ '^[a-f0-9]{32}(-[1-9][0-9]*)?$',false)
$$;
alter table sandbox_commerce_v1.paid_video_uploads add column r2_identity jsonb
 check(r2_identity is null or (object_version is null and sandbox_commerce_v1.r2_identity_valid(r2_identity)));
alter table sandbox_commerce_v1.delivery_assets alter column object_version drop not null;
alter table sandbox_commerce_v1.delivery_assets add column r2_identity jsonb;
alter table sandbox_commerce_v1.delivery_assets add constraint typed_object_identity check(
 (provider='cloudflare_r2' and object_version is null and sandbox_commerce_v1.r2_identity_valid(r2_identity))
 or (provider<>'cloudflare_r2' and object_version is not null and r2_identity is null));
create unique index delivery_assets_r2_identity on sandbox_commerce_v1.delivery_assets(provider,bucket,object_key,(r2_identity->>'nativeVersion')) where provider='cloudflare_r2';
alter table sandbox_commerce_v1.delivery_asset_scans alter column object_version drop not null;
alter table sandbox_commerce_v1.delivery_asset_scans add column r2_identity jsonb;
alter table sandbox_commerce_v1.delivery_asset_scans add constraint typed_object_identity check(
 (provider='cloudflare_r2' and object_version is null and sandbox_commerce_v1.r2_identity_valid(r2_identity))
 or (provider<>'cloudflare_r2' and object_version is not null and r2_identity is null));

create table sandbox_commerce_v1.r2_profiles(
 id uuid primary key, configuration_digest text not null unique
 check(configuration_digest='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0'),
 route_id uuid not null unique references sandbox_commerce_v1.paid_video_routes,
 worker_id uuid not null references sandbox_commerce_v1.paid_video_workers,
 verifier_id uuid not null references sandbox_commerce_v1.paid_video_verifiers,
 key_id uuid not null unique, gateway_key bytea not null check(octet_length(gateway_key)=32),
 qualification_sha256 text not null check(qualification_sha256 ~ '^[a-f0-9]{64}$'),
 capacity_evidence_sha256 text not null check(capacity_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 qualified_max_bytes integer not null check(qualified_max_bytes=16777216),
 enabled boolean not null default false
);
create table sandbox_commerce_v1.r2_bindings(
 id uuid primary key, profile_id uuid not null references sandbox_commerce_v1.r2_profiles,
 upload_id uuid not null references sandbox_commerce_v1.paid_video_uploads,
 request_id uuid not null, user_id uuid, session_id uuid, grant_id uuid,
 operation text not null check(operation in ('upload','probe','scan','range')),
 token jsonb not null, issued_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at>issued_at and expires_at<=issued_at+interval '5 seconds')
);
create unique index r2_one_upload_binding on sandbox_commerce_v1.r2_bindings(upload_id) where operation='upload';
-- INSERT claim is the durable irreversible dispatch boundary. No UPDATE retry
-- can turn started, unknown, or conflicting writes into an admitted upload.
create table sandbox_commerce_v1.r2_dispatches(
 upload_id uuid primary key references sandbox_commerce_v1.paid_video_uploads,
 binding_id uuid not null unique references sandbox_commerce_v1.r2_bindings,
 started_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.r2_commits(
 upload_id uuid primary key references sandbox_commerce_v1.r2_dispatches,
 state text not null check(state in ('acknowledged','unknown','exists_unverified')),
 identity jsonb, committed_at timestamptz not null default clock_timestamp(),
 check((state='acknowledged' and sandbox_commerce_v1.r2_identity_valid(identity)) or (state<>'acknowledged' and identity is null))
);
create table sandbox_commerce_v1.r2_receipts(
 upload_id uuid primary key references sandbox_commerce_v1.r2_commits,
 binding_id uuid not null references sandbox_commerce_v1.r2_bindings,
 verifier_id uuid not null references sandbox_commerce_v1.paid_video_verifiers,
 identity jsonb not null check(sandbox_commerce_v1.r2_identity_valid(identity)),
 raw_body text not null check(octet_length(raw_body)<=16384), signature text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.r2_tickets(
 ticket_id uuid primary key references sandbox_commerce_v1.paid_video_tickets,
 profile_id uuid not null references sandbox_commerce_v1.r2_profiles,
 object jsonb not null
);
do $$ declare t text; begin
 foreach t in array array['r2_profiles','r2_bindings','r2_dispatches','r2_commits','r2_receipts','r2_tickets'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.protect_resource_identity(%s)',t,case when t='r2_profiles' then '''enabled''' else '' end);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
-- Profile provider and key separation are checked both on provisioning and on
-- every use. A later worker/verifier key insertion cannot silently weaken it.
create function sandbox_commerce_v1.r2_ready(p_configuration text,p_route uuid default null) returns boolean
language plpgsql volatile set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 select * into p from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration and enabled for share nowait;
 if not found or (p_route is not null and p.route_id<>p_route)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration)
 then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_routes where id=p.route_id and active and provider='cloudflare_r2'
  and bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' for share nowait;
 if not found then return false; end if;
 lock table sandbox_commerce_v1.paid_video_workers,sandbox_commerce_v1.paid_video_verifiers in share mode nowait;
 perform 1 from sandbox_commerce_v1.paid_video_workers w join sandbox_commerce_v1.paid_video_verifiers v on v.id=p.verifier_id
  where w.id=p.worker_id and w.active and v.active and w.hmac_key<>v.hmac_key and w.hmac_key<>p.gateway_key and v.hmac_key<>p.gateway_key
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers x where x.hmac_key in(v.hmac_key,p.gateway_key))
  and not exists(select 1 from sandbox_commerce_v1.paid_video_verifiers x where x.hmac_key=p.gateway_key);
 return found;
end $$;
create function sandbox_commerce_v1.r2_object(p_upload uuid,p_identity boolean default true) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('provider','cloudflare_r2','bucket',r.bucket,'routeId',r.id,'objectKey',u.object_key,
  'incarnation',u.incarnation,'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length)
  ||case when p_identity then jsonb_build_object('identity',c.identity) else '{}'::jsonb end
 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id and r.provider='cloudflare_r2'
 left join sandbox_commerce_v1.r2_commits c on c.upload_id=u.id and c.state='acknowledged' where u.id=p_upload
$$;
create function sandbox_commerce_v1.r2_upload_identity_guard() returns trigger language plpgsql set search_path='' as $$
declare provider text; begin
 select r.provider into strict provider from sandbox_commerce_v1.paid_video_routes r where r.id=new.route_id;
 if (provider='cloudflare_r2' and new.object_version is not null) or (provider<>'cloudflare_r2' and new.r2_identity is not null)
  or (tg_op='UPDATE' and old.r2_identity is not null and old.r2_identity is distinct from new.r2_identity)
 then raise exception 'paid_video_typed_identity_required'; end if;
 if new.r2_identity is not null and not exists(select 1 from sandbox_commerce_v1.r2_receipts r where r.upload_id=new.id and r.identity=new.r2_identity)
 then raise exception 'paid_video_r2_receipt_required'; end if;
 return new;
end $$;
drop trigger identity_immutable on sandbox_commerce_v1.paid_video_uploads;
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_uploads for each row
 execute function sandbox_commerce_v1.protect_resource_identity('state','object_version','r2_identity','clean_result_sha256','daily_definitions_at','moderation');
create trigger typed_identity before insert or update on sandbox_commerce_v1.paid_video_uploads for each row execute function sandbox_commerce_v1.r2_upload_identity_guard();
revoke all on function sandbox_commerce_v1.r2_identity_valid(jsonb),sandbox_commerce_v1.r2_ready(text,uuid),sandbox_commerce_v1.r2_object(uuid,boolean),sandbox_commerce_v1.r2_upload_identity_guard()
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway;
reset role;

set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.native_r2_assert_media(i sandbox_commerce_v1.intents)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v sandbox_commerce_v1.video_terms; asset sandbox_commerce_v1.delivery_assets;
 upload sandbox_commerce_v1.paid_video_uploads; route sandbox_commerce_v1.paid_video_routes;
 version sandbox_commerce_v1.resource_versions;
begin
 select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=i.resource_id and revision=i.resource_revision for share nowait;
 select * into strict v from sandbox_commerce_v1.video_terms where resource_id=i.resource_id and revision=i.resource_revision for share nowait;
 asset:=sandbox_commerce_v1.clean_resource_asset(v.asset_id,i.resource_id,i.resource_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=i.resource_id and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 if row(version.kind,version.creator_id,version.price_minor,version.currency) is distinct from row(i.kind,i.creator_id,i.amount_minor,i.currency)
  or i.kind<>'paid_content' or v.audience<>'paid' or upload.state<>'clean' or upload.moderation<>'clear'
  or not route.active or route.provider<>'cloudflare_r2'
  or not sandbox_commerce_v1.r2_ready('8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',route.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=upload.id and rr.identity=upload.r2_identity)
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.r2_identity,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.r2_identity,asset.incarnation,asset.sha256,asset.byte_length)
 then raise exception 'test_store_v3_current_media_required'; end if;
end; $$;
create function sandbox_commerce_v1.native_typed_assert_media(i sandbox_commerce_v1.intents) returns void language plpgsql volatile set search_path='' as $$begin
 if exists(select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id where u.resource_id=i.resource_id and r.provider='cloudflare_r2')
 then perform sandbox_commerce_v1.native_r2_assert_media(i);else perform sandbox_commerce_v1.test_store_v3_assert_media(i);end if;end $$;
create function sandbox_commerce_v1.native_store_paid_video_r2_access(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants;r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;
 asset sandbox_commerce_v1.delivery_assets;video sandbox_commerce_v1.video_terms;
 upload sandbox_commerce_v1.paid_video_uploads;route sandbox_commerce_v1.paid_video_routes;
 ctl sandbox_commerce_v1.r2_profiles;authority jsonb;evidence jsonb;delivery jsonb;deadline timestamptz;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 if p_user is null or p_session is null or p_resource is null or p_grant is null then raise exception 'native_video_binding_required';end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Same generic hold/grant graph as existing private delivery. NOWAIT prevents
 -- acknowledging access while intake or negative application changes it.
 lock table sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds in share mode nowait;
 select * into strict g from sandbox_commerce_v1.resource_grants where id=p_grant and buyer_id=p_user and product_id=p_resource for share nowait;
 select * into strict r from sandbox_commerce_v1.receipts where id=g.receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified' or g.revoked_at is not null
  or i.provider<>'revenuecat' or i.store not in('APP_STORE','PLAY_STORE') or i.currency<>'usd' or i.buyer_id<>p_user
  or row(g.product_id,g.product_revision) is distinct from row(i.resource_id,i.resource_revision)
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 then raise exception 'native_video_exact_receipt_required';end if;
 -- This owner-private helper re-reads allocation, original journal/effect and
 -- mapping/dispatch/connection revocations under the common project lock. A
 -- generic verified receipt or caller-supplied boolean is never sufficient.
 evidence:=sandbox_commerce_v1.native_store_assert_current_allocation(r.id,p_user);
 if evidence->>'allocationId' is null or evidence->>'projectId' is null
  or evidence->>'originalTransactionId' is distinct from r.original_transaction_id
 then raise exception 'native_video_current_allocation_required';end if;
 if (sandbox_commerce_v1.current_resource_grant(p_user,p_resource,g.product_revision)).id is distinct from g.id
 then raise exception 'native_video_exact_current_grant_required';end if;
 delivery:=sandbox_commerce_v1.authorize_resource_delivery(p_user,p_session,p_resource,g.product_revision,p_resource,g.product_revision,'play_video');
 if delivery->>'issuer' is distinct from 'media_signer' or delivery->>'eligibleForIssuer' is distinct from 'true'
 then raise exception 'native_video_media_authority_required';end if;
 select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=g.product_revision;
 asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_resource,g.product_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 select * into strict ctl from sandbox_commerce_v1.r2_profiles where route_id=route.id for share nowait;
 if not sandbox_commerce_v1.r2_ready(ctl.configuration_digest,route.id) then raise exception 'native_video_r2_profile_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then raise exception 'native_video_worker_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 if not found then raise exception 'native_video_verifier_unavailable';end if;
 if not ctl.enabled or ctl.route_id is distinct from route.id or not route.active or route.provider<>'cloudflare_r2' or upload.state<>'clean' or upload.moderation<>'clear'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.r2_identity,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.r2_identity,asset.incarnation,asset.sha256,asset.byte_length)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr join sandbox_commerce_v1.r2_commits c on c.upload_id=rr.upload_id
    where rr.upload_id=upload.id and rr.verifier_id=ctl.verifier_id and rr.identity=upload.r2_identity and c.state='acknowledged' and c.identity=rr.identity)
 then raise exception 'native_video_current_object_required';end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,to_timestamp((delivery#>>'{binding,expiresAtMs}')::numeric/1000));
 perform sandbox_commerce_v1.assert_fresh(authority);
 if deadline is null or not isfinite(deadline) or clock_timestamp()>=deadline then raise exception 'native_video_access_expired';end if;
 return jsonb_build_object('protocol','nssv1-current-access-gateway-r2-v1','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'resourceId','scv1_resource_'||p_resource,'grantId','scv1_grant_'||g.id,'receiptId','scv1_receipt_'||r.id,
  'originalTransactionId',r.original_transaction_id,'allocationId',evidence->>'allocationId','projectId',evidence->>'projectId',
  'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',route.id,'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,'expectedByteLength',asset.byte_length,'identity',asset.r2_identity),
  'media',jsonb_build_object('assetId','scv1_asset_'||asset.id,'incarnation',asset.incarnation,'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1'));
end $$;
create function sandbox_commerce_v1.r2_scan_ingest(p_raw_body text,p_signature text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; result jsonb; media jsonb; t sandbox_commerce_v1.paid_video_tickets;
 u sandbox_commerce_v1.paid_video_uploads; w sandbox_commerce_v1.paid_video_workers;
 hash text; is_clean boolean; daily_at timestamptz; checked_at timestamptz; authority jsonb;
begin
 if p_raw_body is null or octet_length(p_raw_body)>16384 then raise exception 'paid_video_result_invalid'; end if;
 body:=p_raw_body::jsonb; result:=body->'result'; media:=result->'media';
 if body->>'protocol' is distinct from 'scpv-worker-result-r2-v1' or jsonb_typeof(body)<>'object'
  or not(body ?& array['protocol','ticketId','uploadId','workerId','qualificationSha256','object','result'])
  or (body-array['protocol','ticketId','uploadId','workerId','qualificationSha256','object','result'])<>'{}'::jsonb
  or result->>'protocol' is distinct from 'scpv-byte-scan-v1' or result->>'profile' is distinct from 'scpv-mp4-h264-aac-v1'
  or result->>'moderation' is distinct from 'unreviewed' or result->>'verdict' not in('clean','rejected') or result->>'verdict' is null
 then raise exception 'paid_video_r2_result_invalid'; end if;
 -- Lifecycle shared fence also covers retired negative/replay reconciliation.
 perform sandbox_commerce_v1.assert_generation(false);
 select * into strict t from sandbox_commerce_v1.paid_video_tickets where id=(body->>'ticketId')::uuid for update nowait;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=t.upload_id for update nowait;
 select * into strict w from sandbox_commerce_v1.paid_video_workers where id=t.worker_id for share nowait;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(w.hmac_key,p_raw_body),p_signature)
  then raise exception 'paid_video_worker_signature_invalid' using errcode='42501'; end if;
 if body->>'uploadId' is distinct from 'scpv_upload_'||u.id or body->>'workerId' is distinct from w.id::text
  or not exists(select 1 from sandbox_commerce_v1.r2_tickets rt join sandbox_commerce_v1.r2_profiles p on p.id=rt.profile_id
   where rt.ticket_id=t.id and rt.object=body->'object' and p.worker_id=w.id and p.qualification_sha256=body->>'qualificationSha256')
  or body->'object' is distinct from sandbox_commerce_v1.r2_object(u.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=u.id and rr.identity=body#>'{object,identity}')
  or result->>'sha256' is distinct from u.expected_sha256
  or jsonb_typeof(result->'byteLength') is distinct from 'number' or (result->>'byteLength')::bigint<>u.expected_byte_length
 then raise exception 'paid_video_result_binding_invalid'; end if;
 hash:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
 if exists(select 1 from sandbox_commerce_v1.paid_video_scan_results where sha256=hash)
  then return jsonb_build_object('accepted',true,'upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 is_clean:=result->>'verdict'='clean';
 if is_clean then
  perform sandbox_commerce_v1.assert_generation(true);
  if not sandbox_commerce_v1.r2_ready('8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',u.route_id) then raise exception 'paid_video_r2_profile_unavailable';end if;
  authority:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
  perform 1 from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active for share nowait;
  if not found or not w.active or t.positive_consumed_at is not null or t.expires_at<=clock_timestamp()
   or u.state<>'scan_pending' or u.expires_at<=clock_timestamp() then raise exception 'paid_video_positive_stale'; end if;
  checked_at:=(result->>'checkedAt')::timestamptz;
  select (f->>'createdAt')::timestamptz into strict daily_at from jsonb_array_elements(result#>'{definitions,files}') f where f->>'filename'='daily.cvd';
  if not isfinite(checked_at) or checked_at<t.issued_at-interval '5 seconds' or checked_at>clock_timestamp()+interval '5 seconds'
   or not isfinite(daily_at) or daily_at<clock_timestamp()-interval '48 hours' or daily_at>clock_timestamp()+interval '5 minutes'
   or coalesce(result#>>'{definitions,manifestSha256}','') !~ '^[a-f0-9]{64}$'
   or result->>'reason' is distinct from 'exact_bytes_scanned' or media->>'videoCodec' is distinct from 'h264'
   or media->>'pixelFormat' is distinct from 'yuv420p' or (media->>'durationMs')::integer not between 1 and 60000
   or (media->>'width')::integer not between 1 and 1920 or (media->>'height')::integer not between 1 and 1080
   or (media->>'framesPerSecond')::numeric<=0 or (media->>'framesPerSecond')::numeric>60
   or (media->>'audioCodec' is not null and media->>'audioCodec'<>'aac')
   or media is null or media='null'::jsonb or not(media ?& array['durationMs','width','height','framesPerSecond','videoCodec','pixelFormat','audioCodec'])
   or jsonb_typeof(media->'durationMs') is distinct from 'number' or jsonb_typeof(media->'width') is distinct from 'number'
   or jsonb_typeof(media->'height') is distinct from 'number' or jsonb_typeof(media->'framesPerSecond') is distinct from 'number'
  then raise exception 'paid_video_scan_evidence_invalid'; end if;
  update sandbox_commerce_v1.paid_video_uploads set state='clean',
   clean_result_sha256=hash,daily_definitions_at=daily_at where id=u.id returning * into u;
  update sandbox_commerce_v1.paid_video_tickets set positive_consumed_at=clock_timestamp() where id=t.id;
 else
  -- Authenticated late negatives are monotonic, including after lease/lifecycle
  -- retirement or key deactivation. They never create positive authority.
  update sandbox_commerce_v1.paid_video_uploads set state='rejected',moderation='removed' where id=u.id returning * into u;
  update sandbox_commerce_v1.resources set status='quarantined' where id=u.resource_id;
  update sandbox_commerce_v1.offers set status='retired' where resource_id=u.resource_id;
  update sandbox_commerce_v1.delivery_assets set moderation='removed' where id=u.asset_id;
 end if;
 insert into sandbox_commerce_v1.paid_video_scan_results values(hash,t.id,p_raw_body,p_signature,is_clean,clock_timestamp());
 if is_clean then perform sandbox_commerce_v1.assert_fresh(authority); end if;
 return jsonb_build_object('accepted',true,'upload',sandbox_commerce_v1.paid_video_upload_json(u));
end $$;
create or replace function sandbox_commerce_v1.paid_video_gateway_ready(p_configuration text,p_route uuid default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare ctl sandbox_commerce_v1.paid_video_gateway_controls; native sandbox_commerce_v1.test_store_v3_native_profiles;
 profile sandbox_commerce_v1.paid_video_native_authoring_profiles;
 conn sandbox_commerce_v1.test_store_v3_connections; checkout sandbox_commerce_v1.test_store_v3_controls;
begin
 if exists(select 1 from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration and (route_id=p_route or (p_route is null and enabled)))
 then return sandbox_commerce_v1.r2_ready(p_configuration,p_route); end if;
 perform 1 from sandbox_commerce_v1.lifecycle where singleton and state='active' for share nowait;
 if not found then return false; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' then
  lock table sandbox_commerce_v1.test_store_v3_native_profiles in share mode nowait;
  if exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration) then return false; end if;
  select * into profile from sandbox_commerce_v1.paid_video_native_authoring_profiles where configuration_digest=p_configuration and enabled for share nowait;
  if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route)
   or row(profile.route_id,profile.worker_id,profile.verifier_id,profile.qualification_sha256)
    is distinct from row(ctl.route_id,ctl.worker_id,ctl.verifier_id,ctl.qualification_sha256) then return false; end if;
 else
 select * into native from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration and qualified for share nowait;
 if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route) then return false; end if;
 select * into strict conn from sandbox_commerce_v1.test_store_v3_connections where id=native.connection_id and revision=native.connection_revision for share nowait;
 select * into strict checkout from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 if not conn.qualified or not checkout.ingress_enabled or not checkout.provisioning_enabled or not checkout.initiation_enabled
  or row(checkout.connection_id,checkout.connection_revision) is distinct from row(conn.id,conn.revision) then return false; end if;
 perform sandbox_commerce_v1.test_store_v3_scope_exclusive(conn.project_id);
 end if;
 perform 1 from sandbox_commerce_v1.paid_video_routes where id=ctl.route_id and active and provider='s3' for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 return found;
end $$;
create or replace function sandbox_commerce_v1.paid_video_native_command(p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; uid uuid; sid uuid; req uuid;
 allowed text[]; authority jsonb; creator_authority jsonb; prior sandbox_commerce_v1.paid_video_requests;
 u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.resources; route sandbox_commerce_v1.paid_video_routes;
 o sandbox_commerce_v1.offers; c sandbox_commerce_v1.catalog; result jsonb; body jsonb; state text:='ok';
 upload uuid; rid uuid; asset uuid; incarnation uuid; page jsonb; next_cursor text; cursor_row sandbox_commerce_v1.paid_video_uploads;
 mutation boolean; replay boolean:=false;
begin
 if claims->>'role' is distinct from 'authenticated' or claims->>'sub' is null or claims->>'session_id' is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8192
  or p_payload->>'protocol' is distinct from 'isolated-paid-video-v1' or p_expected_account_id is null or p_expected_session_generation is null
 then raise exception 'paid_video_request_invalid' using errcode='42501'; end if;
 uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid; req:=(p_payload->>'requestId')::uuid;
 if uid is distinct from p_expected_account_id or sid is distinct from p_expected_session_generation or req is null
 then raise exception 'paid_video_actor_binding_invalid' using errcode='42501'; end if;
 allowed:=array['protocol','requestId']||case p_command
  when 'capability.read' then array[]::text[] when 'studio.read' then array['limit','cursor']
  when 'upload.reserve' then array['title','expectedSha256','expectedByteLength']
  when 'upload.read' then array['uploadId'] when 'upload.finalize' then array['uploadId']
  when 'upload.recover' then array['originalRequestId'] when 'resource.read' then array['resourceId']
  when 'offer.publish' then array['uploadId','expectedRevision','amountMinor','currency']
  when 'offer.retire' then array['offerId','expectedRevision'] when 'offer.read' then array['offerId'] else null end;
 if allowed is null or not(p_payload ?& allowed) or (p_payload-allowed)<>'{}'::jsonb
  or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
  or (p_payload ? 'expectedRevision' and (jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number' or p_payload->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'))
  or (p_payload ? 'amountMinor' and (jsonb_typeof(p_payload->'amountMinor') is distinct from 'number' or p_payload->>'amountMinor' !~ '^[1-9][0-9]{0,8}$'))
  or (p_payload ? 'currency' and (jsonb_typeof(p_payload->'currency') is distinct from 'string' or p_payload->>'currency' !~ '^[a-z]{3}$'))
 then raise exception 'paid_video_payload_invalid'; end if;
 perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
 mutation:=p_command in ('upload.reserve','upload.finalize','offer.publish','offer.retire');
 if mutation then
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-paid-video-v1:'||uid||':'||req,687)) then raise exception 'paid_video_request_busy' using errcode='55P03'; end if;
  select * into prior from sandbox_commerce_v1.paid_video_requests where user_id=uid and request_id=req;
  if found then
   if prior.command is distinct from p_command or prior.payload is distinct from p_payload or prior.session_id is distinct from sid
    then raise exception 'paid_video_idempotency_conflict'; end if;
   replay:=true; select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=prior.upload_id and creator_id=uid;
  end if;
 end if;
 if replay then
  body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u));
  if p_command in ('offer.publish','offer.retire') then
   select * into strict o from sandbox_commerce_v1.offers where resource_id=u.resource_id;
   body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
  end if;
 elsif p_command='upload.recover' then
  if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string' then raise exception 'paid_video_payload_invalid'; end if;
  select * into prior from sandbox_commerce_v1.paid_video_requests where user_id=uid and request_id=(p_payload->>'originalRequestId')::uuid;
  if not found then state:='unknown'; body:=jsonb_build_object('recovery',jsonb_build_object('state','unknown','originalRequestId',p_payload->>'originalRequestId'));
  else
   select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=prior.upload_id and creator_id=uid;
   body:=jsonb_build_object('recovery',jsonb_build_object('state','recorded','originalRequestId',prior.request_id,
    'originalCommand',prior.command,'originalSessionGeneration',prior.session_id,'originalPayload',prior.payload),
    'upload',sandbox_commerce_v1.paid_video_upload_json(u));
   if prior.command in ('offer.publish','offer.retire') then
    select * into strict o from sandbox_commerce_v1.offers where resource_id=u.resource_id;
    body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
   end if;
  end if;
 elsif p_command='capability.read' then
  begin
   perform sandbox_commerce_v1.assert_generation(true);
   creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  exception when insufficient_privilege then creator_authority:=null;
  end;
  body:=jsonb_build_object('creatorEligible',creator_authority is not null,'uploadRouteAvailable',
   exists(select 1 from sandbox_commerce_v1.paid_video_routes where active),'transferAvailable',false,'checkoutAvailable',false,
   'profile',jsonb_build_object('id','scpv-mp4-h264-aac-v1','maxBytes',16777216,'maxDurationMs',60000,'maxWidth',1920,'maxHeight',1080,
    'maxFramesPerSecond',60,'videoCodec','h264','pixelFormat','yuv420p','optionalAudioCodec','aac','maxAudioChannels',2,'maxAudioSampleRate',48000));
 elsif p_command='studio.read' then
  if jsonb_typeof(p_payload->'limit') is distinct from 'number' or p_payload->>'limit' !~ '^([1-9]|[1-4][0-9]|50)$'
   or jsonb_typeof(p_payload->'cursor') not in ('null','string') then raise exception 'paid_video_pagination_invalid'; end if;
  if p_payload->>'cursor' is not null then
   select * into strict cursor_row from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'cursor') and creator_id=uid;
  end if;
  select coalesce(jsonb_agg(sandbox_commerce_v1.paid_video_upload_json(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into page
   from (select * from sandbox_commerce_v1.paid_video_uploads where creator_id=uid
    and (cursor_row.id is null or (created_at,id)<(cursor_row.created_at,cursor_row.id))
    order by created_at desc,id desc limit (p_payload->>'limit')::integer+1) x;
  if jsonb_array_length(page)>(p_payload->>'limit')::integer then
   page:=page-(p_payload->>'limit')::integer; next_cursor:=page->(jsonb_array_length(page)-1)->>'id';
  end if;
  body:=jsonb_build_object('uploads',page,'nextCursor',next_cursor);
 elsif p_command='upload.reserve' then
  perform sandbox_commerce_v1.assert_generation(true); creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  if jsonb_typeof(p_payload->'title') is distinct from 'string' or length(btrim(p_payload->>'title')) not between 1 and 200
   or jsonb_typeof(p_payload->'expectedSha256') is distinct from 'string' or p_payload->>'expectedSha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_payload->'expectedByteLength') is distinct from 'number' or p_payload->>'expectedByteLength' !~ '^[1-9][0-9]{0,7}$'
   or (p_payload->>'expectedByteLength')::integer>16777216 then raise exception 'paid_video_expectation_invalid'; end if;
  select rr.* into route from sandbox_commerce_v1.paid_video_routes rr where rr.active and
   (rr.id=(select p.route_id from sandbox_commerce_v1.r2_profiles p where p.configuration_digest='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and p.enabled)
    or (not exists(select 1 from sandbox_commerce_v1.r2_profiles where enabled) and rr.provider='s3'
     and rr.id=(select route_id from sandbox_commerce_v1.paid_video_native_authoring_profiles where enabled))) for share nowait;
  if not found then state:='held'; body:=jsonb_build_object('reason','immutable_upload_route_unavailable');
  else
   if not pg_try_advisory_xact_lock(hashtextextended('paid-video-reservation:'||uid,687)) then raise exception 'paid_video_reservation_busy' using errcode='55P03'; end if;
   if (select count(*) from sandbox_commerce_v1.paid_video_uploads where creator_id=uid and created_at>clock_timestamp()-interval '1 day')>=20
    then raise exception 'paid_video_reservation_limit'; end if;
   rid:=gen_random_uuid(); asset:=gen_random_uuid(); incarnation:=gen_random_uuid();
   insert into sandbox_commerce_v1.resources(id,creator_id,kind,title) values(rid,uid,'paid_content',btrim(p_payload->>'title'));
   insert into sandbox_commerce_v1.paid_video_uploads(creator_id,resource_id,asset_id,incarnation,route_id,object_key,expected_sha256,expected_byte_length)
    values(uid,rid,asset,incarnation,route.id,'sandbox-commerce-v1/'||uid||'/scv1_resource_'||rid||'/scv1_asset_'||asset||'/'||incarnation||'.mp4',
    p_payload->>'expectedSha256',(p_payload->>'expectedByteLength')::integer) returning * into u;
   body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u));
  end if;
 elsif p_command in ('upload.read','upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=uid for update nowait;
  select * into strict r from sandbox_commerce_v1.resources where id=u.resource_id for update nowait;
  if p_command<>'upload.read' then
   perform sandbox_commerce_v1.assert_generation(true); creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  end if;
  if p_command='upload.finalize' then
   if u.state<>'reserved' or u.expires_at<=clock_timestamp() or r.status<>'draft' then raise exception 'paid_video_finalize_unavailable'; end if;
   update sandbox_commerce_v1.paid_video_uploads set state='scan_pending' where id=u.id returning * into u;
  elsif p_command='offer.publish' then
   select * into strict route from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active for share nowait;
   if r.revision<>(p_payload->>'expectedRevision')::bigint or r.status<>'draft' or u.state<>'clean' or u.moderation<>'clear'
    or u.clean_result_sha256 is null or (route.provider='s3' and u.object_version is null) or (route.provider='cloudflare_r2' and not sandbox_commerce_v1.r2_identity_valid(u.r2_identity)) or u.daily_definitions_at<clock_timestamp()-interval '48 hours'
    or not exists(select 1 from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 and accepted_positive)
    then raise exception 'paid_video_publication_evidence_unavailable'; end if;
   c:=sandbox_commerce_v1.paid_video_native_catalog((p_payload->>'amountMinor')::bigint,p_payload->>'currency');
   if c.id is null then state:='held'; body:=jsonb_build_object('reason','native_catalog_unavailable');
   else
    insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency)
     values(r.id,r.revision,r.creator_id,'paid_content',r.title,c.amount_minor,c.currency);
    insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,r2_identity,
     incarnation,sha256,byte_length,state,moderation) values(u.asset_id,r.id,r.revision,uid,'video',route.provider,route.bucket,u.object_key,
     u.object_version,u.r2_identity,u.incarnation,u.expected_sha256,u.expected_byte_length,'retained','clear');
    insert into sandbox_commerce_v1.delivery_asset_scans(asset_id,incarnation,provider,bucket,object_key,object_version,r2_identity,sha256,byte_length,state,scanner_version,completed_at)
     select u.asset_id,u.incarnation,route.provider,route.bucket,u.object_key,u.object_version,u.r2_identity,u.expected_sha256,u.expected_byte_length,'clean',
      'scpv-byte-scan-v1:'||u.clean_result_sha256,(raw_body::jsonb#>>'{result,checkedAt}')::timestamptz
      from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256;
    insert into sandbox_commerce_v1.video_terms values(r.id,r.revision,u.asset_id,'paid');
    insert into sandbox_commerce_v1.offers(resource_id,resource_revision,catalog_id) values(r.id,r.revision,c.id) returning * into o;
    perform sandbox_commerce_v1.paid_video_native_bind_offer(o);
    update sandbox_commerce_v1.resources set status='published' where id=r.id;
    body:=jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o),'upload',sandbox_commerce_v1.paid_video_upload_json(u));
   end if;
  end if;
  if p_command<>'offer.publish' then body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 elsif p_command='resource.read' then
  select * into strict r from sandbox_commerce_v1.resources where id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource') and creator_id=uid;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=r.id and creator_id=uid;
  body:=jsonb_build_object('resource',sandbox_commerce_v1.resource_json(r)||jsonb_build_object('title',r.title),'upload',sandbox_commerce_v1.paid_video_upload_json(u));
 elsif p_command in ('offer.read','offer.retire') then
  select * into strict o from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for update nowait;
  select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id for update nowait;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=r.id for update nowait;
  if p_command='offer.retire' then
   if r.creator_id<>uid or o.revision<>(p_payload->>'expectedRevision')::bigint then raise exception 'paid_video_offer_unavailable'; end if;
   update sandbox_commerce_v1.offers set status='retired' where id=o.id returning * into o;
   update sandbox_commerce_v1.resources set status='retired' where id=r.id;
   update sandbox_commerce_v1.paid_video_uploads x set state=case when x.state='rejected' then x.state else 'retired' end where id=u.id returning * into u;
   update sandbox_commerce_v1.delivery_assets set moderation=case when moderation='removed' then moderation else 'held' end where id=u.asset_id;
  elsif r.creator_id<>uid and (o.status<>'published' or r.status<>'published' or u.state<>'clean' or u.moderation<>'clear')
   then raise exception 'paid_video_offer_unavailable'; end if;
  body:=jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
  if r.creator_id=uid then body:=body||jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 end if;
 if mutation and not replay and state='ok' then
  insert into sandbox_commerce_v1.paid_video_requests(user_id,request_id,session_id,command,payload,upload_id) values(uid,req,sid,p_command,p_payload,u.id);
 end if;
 perform sandbox_commerce_v1.assert_fresh(authority);
 if creator_authority is not null then perform sandbox_commerce_v1.assert_fresh(creator_authority); end if;
 result:=jsonb_build_object('protocol','isolated-paid-video-v1','command',p_command,'requestId',req,'status',state,
  'actor',jsonb_build_object('userId',uid,'accountId',uid,'sessionGeneration',sid),'data',body);
 return result;
end $$;
create or replace function sandbox_commerce_v1.paid_video_command_v2(p_command text,p_payload jsonb,p_user uuid,p_session uuid,p_configuration text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; u sandbox_commerce_v1.paid_video_uploads; ready boolean; transfer boolean; body jsonb; authority jsonb; creator boolean:=false;
 claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; o sandbox_commerce_v1.offers;
 context sandbox_commerce_v1.paid_video_gateway_requests; mutation boolean; req uuid; transfer_descriptor jsonb;
begin
 if claims->>'role' is distinct from 'authenticated' or p_user is null or p_session is null
  or claims->>'sub' is distinct from p_user::text or claims->>'session_id' is distinct from p_session::text
 then raise exception 'paid_video_actor_binding_invalid' using errcode='42501'; end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_configuration is null or p_configuration !~ '^[a-f0-9]{64}$' then raise exception 'paid_video_configuration_invalid'; end if;
 mutation:=p_command in ('upload.reserve','upload.finalize','offer.publish','offer.retire');
 if mutation then
  req:=(p_payload->>'requestId')::uuid;
  if req is null then raise exception 'paid_video_request_invalid'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-paid-video-v1:'||p_user||':'||req,687))
  then raise exception 'paid_video_request_busy' using errcode='55P03'; end if;
  select * into context from sandbox_commerce_v1.paid_video_gateway_requests where user_id=p_user and request_id=req;
  if found then
   if row(context.session_id,context.configuration_digest,context.command,context.payload)
    is distinct from row(p_session,p_configuration,p_command,p_payload) then raise exception 'paid_video_v2_context_conflict'; end if;
  elsif exists(select 1 from sandbox_commerce_v1.paid_video_requests where user_id=p_user and request_id=req)
   then raise exception 'paid_video_v2_context_required';
  end if;
 end if;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration)
 then raise exception 'paid_video_authoring_mode_conflict'; end if;
 ready:=sandbox_commerce_v1.paid_video_gateway_ready(p_configuration);
 if p_command='upload.reserve' then
  if not ready or (p_configuration<>'8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and
    (select id from sandbox_commerce_v1.paid_video_routes where active order by id limit 1)
    is distinct from (select route_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton))
  then raise exception 'paid_video_gateway_unavailable'; end if;
 elsif p_command in ('upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=p_user for update nowait;
  if not ready or not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   or not (exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id and r.object_version=u.object_version)
    or exists(select 1 from sandbox_commerce_v1.r2_receipts r where r.upload_id=u.id and r.identity=u.r2_identity))
  then raise exception 'paid_video_object_receipt_required'; end if;
 end if;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' then
  result:=sandbox_commerce_v1.paid_video_native_command(p_command,p_payload,p_user,p_session);
 else
 result:=sandbox_commerce_v1.paid_video_command(p_command,p_payload,p_user,p_session);
 end if;
 body:=result->'data';
 if mutation and result->>'status'='ok' and context.request_id is null then
  insert into sandbox_commerce_v1.paid_video_gateway_requests values(p_user,req,p_session,p_configuration,p_command,p_payload);
 end if;
 if p_command='upload.recover' and result->>'status'='ok' then
  select * into strict context from sandbox_commerce_v1.paid_video_gateway_requests
   where user_id=p_user and request_id=(p_payload->>'originalRequestId')::uuid;
  body:=jsonb_set(body,'{recovery}',(body->'recovery')||jsonb_build_object('originalConfigurationDigest',context.configuration_digest));
 end if;
 if p_command='resource.read' then
  select * into o from sandbox_commerce_v1.offers where resource_id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource');
  if found then body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o)); end if;
 end if;
 if p_command='capability.read' then
  body:=body||jsonb_build_object('uploadRouteAvailable',ready,'transferAvailable',ready and (body->>'creatorEligible')::boolean,
   'checkoutAvailable',ready and p_configuration<>'8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0');
 end if;
 if body ? 'upload' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(body#>>'{upload,id}');
  perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
  if ready then
   begin
    perform sandbox_commerce_v1.assert_fresh(sandbox_commerce_v1.assert_authority(p_user,p_session,'creator')); creator:=true;
   exception when insufficient_privilege then creator:=false;
   end;
  end if;
  transfer:=ready and creator and u.creator_id=p_user and u.state='reserved' and u.expires_at>clock_timestamp()
   and sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   and not exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   and not exists(select 1 from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload');
  body:=jsonb_set(body,'{upload}',(body->'upload')||jsonb_build_object('transferAvailable',transfer,'checkoutAvailable',false));
  if p_command='upload.read' then
   select jsonb_build_object('requestId',t.request_id,'originalSessionId',t.session_id,'configurationDigest',ct.configuration_digest)
    into transfer_descriptor from sandbox_commerce_v1.paid_video_transfers t
    join sandbox_commerce_v1.paid_video_gateway_transfers ct on ct.transfer_id=t.id where t.upload_id=u.id and t.user_id=p_user;
   if transfer_descriptor is null and exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   then raise exception 'paid_video_v2_transfer_context_required'; end if;
   if transfer_descriptor is null then
    select jsonb_build_object('requestId',b.request_id,'originalSessionId',b.session_id,'configurationDigest',p.configuration_digest)
     into transfer_descriptor from sandbox_commerce_v1.r2_bindings b join sandbox_commerce_v1.r2_profiles p on p.id=b.profile_id
     where b.upload_id=u.id and b.operation='upload';
   end if;
   body:=body||jsonb_build_object('transfer',transfer_descriptor);
  end if;
 end if;
 if body ? 'offer' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=sandbox_commerce_v1.identifier(body#>>'{offer,resourceId}','resource');
  perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
  body:=jsonb_set(body,'{offer}',(body->'offer')||jsonb_build_object('checkoutAvailable',ready and body#>>'{offer,status}'='published'
   and exists(select 1 from sandbox_commerce_v1.offers offer_row join sandbox_commerce_v1.test_store_v3_products p on p.catalog_id=offer_row.catalog_id
    join sandbox_commerce_v1.test_store_v3_native_profiles n on n.configuration_digest=p_configuration
    where offer_row.id=sandbox_commerce_v1.identifier(body#>>'{offer,id}','offer') and p.qualified
     and row(p.connection_id,p.connection_revision)=row(n.connection_id,n.connection_revision))));
 end if;
 -- Studio entries are status/history; transfer still requires upload.read and
 -- a fresh bounded gateway admission. They never advertise reusable authority.
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 perform sandbox_commerce_v1.assert_fresh(authority);
 return result||jsonb_build_object('protocol','isolated-paid-video-v2','configurationDigest',p_configuration,
  'capabilityExpiresAtMs',floor(extract(epoch from least(clock_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz))*1000),'data',body);
end $$;
create or replace function sandbox_commerce_v1.clean_resource_asset(p_id uuid,p_resource uuid,p_revision bigint,p_owner uuid,p_purpose text)
returns sandbox_commerce_v1.delivery_assets language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.delivery_assets; s sandbox_commerce_v1.delivery_asset_scans;
begin
 select * into strict a from sandbox_commerce_v1.delivery_assets where id=p_id for share nowait;
 select * into strict s from sandbox_commerce_v1.delivery_asset_scans where asset_id=a.id and incarnation=a.incarnation for share nowait;
 if a.resource_id<>p_resource or a.resource_revision<>p_revision or a.owner_id<>p_owner or a.purpose<>p_purpose
 or a.state<>'retained' or a.moderation<>'clear' or s.state<>'clean' or s.completed_at>clock_timestamp()
 or row(s.provider,s.bucket,s.object_key,s.object_version,s.r2_identity,s.sha256,s.byte_length)
 is distinct from row(a.provider,a.bucket,a.object_key,a.object_version,a.r2_identity,a.sha256,a.byte_length)
 then raise exception 'sandbox_immutable_clean_asset_required' using errcode='42501'; end if;
 return a;
end; $$;
create or replace function sandbox_commerce_v1.native_store_quote_command_armed(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed text[];buyer jsonb;seller jsonb;prior sandbox_commerce_v1.native_store_selections;
 o sandbox_commerce_v1.offers;r sandbox_commerce_v1.resources;v sandbox_commerce_v1.resource_versions;
 terms sandbox_commerce_v1.video_terms;a sandbox_commerce_v1.delivery_assets;b sandbox_commerce_v1.native_store_catalog_bindings;
 cat jsonb;quote jsonb;body jsonb;status text:='ok';matches integer;enabled boolean;owner_until timestamptz;
begin
 if current_setting('transaction_timeout')::interval<=interval '0 seconds'
  or current_setting('transaction_timeout')::interval>interval '5 seconds'
 then raise exception 'native_store_quote_unarmed' using errcode='42501';end if;
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192
 then raise exception 'native_store_quote_request_invalid';end if;
 allowed:=case p_command when 'offer' then array['offerId','store'] when 'prepare' then array['offerId','store','expectedQuote'] when 'recover' then array['originalRequestId'] end;
 if allowed is null or not(p_payload ?& allowed) or p_payload-allowed<>'{}'::jsonb then raise exception 'native_store_quote_shape_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_command='recover' then
  if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string' or p_payload->>'originalRequestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$'
  then raise exception 'native_store_quote_shape_invalid';end if;
  select * into prior from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and request_id=(p_payload->>'originalRequestId')::uuid;
  if found then body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
  else status:='unknown';body:=jsonb_build_object('selection',null,'reason','preparation_unknown');end if;
 else
  if jsonb_typeof(p_payload->'offerId') is distinct from 'string' or jsonb_typeof(p_payload->'store') is distinct from 'string'
   or p_payload->>'store' not in ('APP_STORE','PLAY_STORE') then raise exception 'native_store_quote_shape_invalid';end if;
  if p_command='prepare' then
   if jsonb_typeof(p_payload->'expectedQuote') is distinct from 'object' then raise exception 'native_store_quote_shape_invalid';end if;
   if not pg_try_advisory_xact_lock(hashtextextended('native-store-prepare:'||p_user,691)) then raise exception 'native_store_quote_busy' using errcode='55P03';end if;
   select * into prior from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and request_id=p_request;
   if found and row(prior.session_id,prior.payload) is distinct from row(p_session,p_payload) then raise exception 'native_store_quote_idempotency_conflict';end if;
  end if;
  if prior.id is not null then
   -- Replayed evidence cannot dispatch; later media withdrawal does not erase it.
   body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
  else
   select * into strict o from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for share nowait;
   select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id for share nowait;
   select * into strict v from sandbox_commerce_v1.resource_versions where resource_id=r.id and revision=o.resource_revision for share nowait;
   if r.kind<>'paid_content' or v.kind<>'paid_content' or r.status<>'published' or o.status<>'published' or r.revision<>o.resource_revision
     or r.creator_id<>v.creator_id or r.creator_id=p_user or v.currency<>'usd'
     or o.revision>9007199254740991 or v.revision>9007199254740991 or v.price_minor>9007199254740991
     then raise exception 'native_store_offer_unavailable';end if;
   select * into strict terms from sandbox_commerce_v1.video_terms where resource_id=r.id and revision=o.resource_revision for share nowait;
   if terms.audience<>'paid' then raise exception 'native_store_offer_unavailable';end if;
   a:=sandbox_commerce_v1.clean_resource_asset(terms.asset_id,r.id,o.resource_revision,r.creator_id,'video');
   -- Existing helper is provider-neutral despite its historical name: it checks
   -- exact retained media/upload/route, not any Test Store checkout permission.
   perform sandbox_commerce_v1.native_typed_assert_media(jsonb_populate_record(null::sandbox_commerce_v1.intents,
     jsonb_build_object('resource_id',r.id,'resource_revision',v.revision,'creator_id',r.creator_id,'kind','paid_content','amount_minor',v.price_minor,'currency',v.currency)));
   if a.byte_length>16777216 then raise exception 'native_store_offer_unavailable';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(r.creator_id,p_user);
   lock table sandbox_commerce_v1.native_store_catalog_bindings,sandbox_commerce_v1.native_store_catalog_retirements in share mode nowait;
   select count(*) into matches from sandbox_commerce_v1.native_store_catalog_bindings x where x.offer_id=o.id and x.offer_revision=o.revision and x.store=p_payload->>'store'
    and not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements z where z.binding_id=x.id and z.binding_revision=x.revision);
   if matches<>1 then
    status:='held';body:=case when p_command='offer' then jsonb_build_object('quote',null,'reason','native_store_catalog_unavailable') else jsonb_build_object('selection',null,'reason','native_store_catalog_unavailable') end;
   else
    select * into strict b from sandbox_commerce_v1.native_store_catalog_bindings x where x.offer_id=o.id and x.offer_revision=o.revision and x.store=p_payload->>'store'
     and not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements z where z.binding_id=x.id and z.binding_revision=x.revision);
    cat:=b.catalog;
    if cat is distinct from jsonb_build_object('protocol','native-store-sandbox-catalog-v1','bindingId','nssv1_catalog_'||b.id,'revision',b.revision,
      'projectId',cat->>'projectId','appId',cat->>'appId','store',b.store,'environment','SANDBOX','wireProductId',cat->>'wireProductId',
      'productType','one_time','basePlanId',null,'resourceId','scv1_resource_'||r.id,'resourceRevision',v.revision,'creatorId',r.creator_id,
      'amountMinor',v.price_minor,'currency','usd','quantity',1,'asset',jsonb_build_object('id','scv1_asset_'||a.id,'incarnation',a.incarnation,
      'sha256',a.sha256,'byteLength',a.byte_length,'resourceRevision',a.resource_revision,'profile','scpv-mp4-h264-aac-v1'))
      or b.revision>9007199254740991
      or exists(select 1 from (values(cat->>'projectId'),(cat->>'appId'),(cat->>'wireProductId')) field(value)
        where coalesce(octet_length(value),0) not between 1 and 512 or value~'[[:cntrl:]]'
        or value is distinct from btrim(value,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
    then raise exception 'native_store_catalog_mismatch';end if;
    quote:=jsonb_build_object('offerId','scv1_offer_'||o.id,'offerRevision',o.revision,'resourceId','scv1_resource_'||r.id,'resourceRevision',v.revision,
      'creatorId',r.creator_id,'kind','paid_content','amountMinor',v.price_minor,'currency','usd','asset',cat->'asset',
      'catalog',jsonb_build_object('bindingId',cat->>'bindingId','revision',b.revision,'projectId',cat->>'projectId','appId',cat->>'appId',
      'store',b.store,'environment','SANDBOX','wireProductId',cat->>'wireProductId'));
    quote:=quote||jsonb_build_object('quoteDigest',encode(sha256(convert_to(quote::text,'UTF8')),'hex'));
    if p_command='offer' then body:=jsonb_build_object('quote',quote,'reason',null);
    else
     select preparation_enabled into strict enabled from sandbox_commerce_v1.native_store_quote_controls where singleton for share nowait;
     if not enabled then status:='held';body:=jsonb_build_object('selection',null,'reason','native_store_preparation_disabled');
     else
      perform sandbox_commerce_v1.assert_generation(true);
      buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'buyer');seller:=sandbox_commerce_v1.assert_authority(r.creator_id,null,'creator_subject');
      if p_payload->'expectedQuote' is distinct from quote then raise exception 'native_store_quote_changed';end if;
      if (select count(*) from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'native_store_preparation_limit';end if;
      perform sandbox_commerce_v1.assert_fresh(buyer);perform sandbox_commerce_v1.assert_fresh(seller);
      if clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
      insert into sandbox_commerce_v1.native_store_selections(buyer_id,session_id,request_id,payload,quote) values(p_user,p_session,p_request,p_payload,quote) returning * into prior;
      body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
     end if;
    end if;
   end if;
  end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 if seller is not null then perform sandbox_commerce_v1.assert_fresh(seller);end if;
 if owner_until is not null and clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
 return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,'data',body,
  'dispatchAllowed',false,'correlation','unsupported');
end $$;
create or replace function sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;mapping jsonb;prior sandbox_commerce_v1.native_store_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_protocol_qualifications;allocation sandbox_commerce_v1.native_store_allocations;
 tomb sandbox_commerce_v1.native_store_negative_tombstones;intent sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts;grantrow sandbox_commerce_v1.resource_grants;
 resource sandbox_commerce_v1.resources;version sandbox_commerce_v1.resource_versions;offer sandbox_commerce_v1.offers;
 video sandbox_commerce_v1.video_terms;asset sandbox_commerce_v1.delivery_assets;
 buyer uuid;project text;scope text;txn text;chain text;product text;event_id text;kind text;effect_kind text;
 event_at timestamptz;purchased_at timestamptz;amount bigint;owner_until timestamptz;result jsonb;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_projection) is distinct from 'object' or
 (select array_agg(key order by key) from jsonb_object_keys(p_projection) key) is distinct from
 array['amountMinor','cancelReason','currency','eventAt','kind','protocol','purchasedAt','quantity','rawSha256']::text[]
 or p_projection->>'protocol' is distinct from 'native-store-authenticated-effect-v1'
 or not coalesce(p_projection->>'kind' in('purchase','refund'),false) then raise exception 'native_store_effect_projection_shape';end if;
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from p_projection->>'rawSha256'
 or raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
 or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
 or raw->>'connectionId' is distinct from mapping->>'connectionId' or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
 or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
 or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 or o->>'productId' is distinct from mapping->>'productId'
 or o->>'userId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
 or coalesce(length(o->>'eventId'),0)=0
 then raise exception 'native_store_authenticated_original_required' using errcode='42501';end if;
 project:=raw->>'projectId';scope:=mapping->>'scopeKey';buyer:=(o->>'userId')::uuid;
 txn:=o->>'transactionId';chain:=o->>'originalTransactionId';product:=o->>'productId';event_id:=o->>'eventId';kind:=p_projection->>'kind';
 event_at:=(p_projection->>'eventAt')::timestamptz;
 if event_at is null or not isfinite(event_at) or event_at>clock_timestamp() or event_at is distinct from (o->>'eventAt')::timestamptz
 then raise exception 'native_store_effect_time_invalid';end if;
 if not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.raw_receipt_id=p_raw_receipt_id and p.project_id=project and p.raw_sha256=raw->>'rawSha256')
 then raise exception 'native_store_effect_pending_parent_required';end if;
 select * into prior from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if row(prior.raw_sha256,prior.connection_id,prior.connection_revision,prior.protocol_id,prior.protocol_revision,prior.claim_id,prior.projection)
  is distinct from row(raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,p_claim_id,p_projection)
  then raise exception 'native_store_effect_idempotency_conflict';end if;
  if prior.kind='positive_applied' then
   select * into strict allocation from sandbox_commerce_v1.native_store_allocations where raw_receipt_id=p_raw_receipt_id;
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=allocation.core_receipt_id;
  end if;
  return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
   'status','already_processed','effectKind',prior.kind,'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
   'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
 end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 if kind='refund' then
  if p_claim_id is not null or o->>'eventType' is distinct from 'CANCELLATION' or p_projection->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
  or p_projection->'amountMinor' is distinct from 'null'::jsonb or p_projection->'currency' is distinct from 'null'::jsonb
  or p_projection->'purchasedAt' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from 'null'::jsonb
  then raise exception 'native_store_exact_refund_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and original_transaction_id=chain;
  if tomb.id is null then
   insert into sandbox_commerce_v1.native_store_negative_tombstones(scope_key,transaction_id,original_transaction_id,product_id,buyer_id,raw_receipt_id)
   values(scope,txn,chain,product,buyer,p_raw_receipt_id) returning * into tomb;
  elsif row(tomb.buyer_id,tomb.product_id,tomb.transaction_id) is distinct from row(buyer,product,txn)
   then raise exception 'native_store_negative_identity_conflict';end if;
  for allocation in select * from sandbox_commerce_v1.native_store_allocations where scope_key=scope and (transaction_id=txn or original_transaction_id=chain) loop
   if allocation.buyer_id<>buyer then raise exception 'native_store_negative_buyer_conflict';end if;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=allocation.core_receipt_id for update nowait;
   if receipt.product_id<>product then raise exception 'native_store_negative_product_conflict';end if;
   insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
   values(buyer,receipt.id,'native_store_refund:'||tomb.id);
   update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where receipt_id=receipt.id and revoked_at is null;
   update sandbox_commerce_v1.receipts set state='refunded',last_event_at=greatest(last_event_at,event_at) where id=receipt.id;
  end loop;
  allocation:=null;grantrow:=null;effect_kind:='negative_applied';
  insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
  values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,null,p_projection);
 else
  if p_claim_id is null or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
   or p_projection->'cancelReason' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from '1'::jsonb
   or p_projection->>'currency' is distinct from 'usd' or jsonb_typeof(p_projection->'amountMinor') is distinct from 'number'
   or p_projection->>'amountMinor' !~ '^[1-9][0-9]*$'
   or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'intakeEnabled' is distinct from 'true'::jsonb
  then raise exception 'native_store_exact_purchase_required';end if;
  amount:=(p_projection->>'amountMinor')::bigint;purchased_at:=(p_projection->>'purchasedAt')::timestamptz;
  if amount>9007199254740991 or not isfinite(purchased_at) or purchased_at>event_at then raise exception 'native_store_purchase_amount_time';end if;
  select * into strict c from sandbox_commerce_v1.native_store_claims where id=p_claim_id and buyer_id=buyer;
  select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=buyer;
  select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=buyer;
  select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=buyer;
  lock table sandbox_commerce_v1.native_store_protocol_revocations in share mode nowait;
  select qualification.* into strict q from sandbox_commerce_v1.native_store_qualified_attempts qa
  join sandbox_commerce_v1.native_store_protocol_qualifications qualification on qualification.id=qa.qualification_id and qualification.revision=qa.qualification_revision where qa.attempt_id=attempt.id;
  if c.transaction_identifier<>txn or c.product_identifier<>product or r.quote is distinct from s.quote
   or s.quote#>>'{catalog,projectId}' is distinct from project or s.quote#>>'{catalog,appId}' is distinct from raw->>'appId'
   or s.quote#>>'{catalog,store}' is distinct from raw->>'store' or s.quote#>>'{catalog,wireProductId}' is distinct from product
   or q.connection_id::text<>raw->>'connectionId' or q.connection_revision<>(raw->>'connectionRevision')::bigint
   or q.quote_digest is distinct from s.quote->>'quoteDigest' or (s.quote->>'amountMinor')::bigint<>amount or s.quote->>'currency'<>'usd'
   or row(q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version) is distinct from row(mapping->>'platform',mapping->>'nativeBuild',mapping->>'nativeVersion',mapping->>'signedAppVersion',mapping->>'sdkVersion')
   or purchased_at<date_trunc('milliseconds',attempt.created_at)
   or exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
  then raise exception 'native_store_exact_qualified_allocation_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and (transaction_id=txn or original_transaction_id=chain);
  if tomb.id is not null then
   if row(tomb.buyer_id,tomb.product_id) is distinct from row(buyer,product) then raise exception 'native_store_tombstone_identity_conflict';end if;
   effect_kind:='purchase_tombstoned';
   insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,c.id,p_projection);
   perform sandbox_commerce_v1.native_store_record_refunded_terminal(r.id,tomb.id);
  else
   perform sandbox_commerce_v1.assert_generation(true);
   select * into strict offer from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(s.quote->>'offerId','offer') for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
   select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=resource.id and revision=offer.resource_revision for share nowait;
   if resource.kind<>'paid_content' or version.kind<>'paid_content' or resource.status<>'published' or offer.status<>'published'
    or resource.revision<>version.revision or resource.creator_id<>version.creator_id or resource.creator_id=buyer
    or s.quote->>'resourceId' is distinct from 'scv1_resource_'||resource.id or (s.quote->>'resourceRevision')::bigint<>version.revision
    or (s.quote->>'offerRevision')::bigint<>offer.revision or s.quote->>'creatorId' is distinct from resource.creator_id::text
    or version.price_minor<>amount or version.currency<>'usd'
   then raise exception 'native_store_current_resource_required';end if;
   select * into strict video from sandbox_commerce_v1.video_terms where resource_id=resource.id and revision=version.revision for share nowait;
   if video.audience<>'paid' then raise exception 'native_store_paid_media_required';end if;
   asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,resource.id,version.revision,resource.creator_id,'video');
   if s.quote->'asset' is distinct from jsonb_build_object('id','scv1_asset_'||asset.id,'incarnation',asset.incarnation,
    'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1')
   then raise exception 'native_store_exact_asset_required';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(resource.creator_id,buyer);
   insert into sandbox_commerce_v1.intents(buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,
    kind,provider,scope_key,store,product_id,amount_minor,currency,state,dispatch_id,dispatched_at)
   values(buyer,attempt.session_id,offer.id,offer.revision,resource.id,version.revision,resource.creator_id,
    'paid_content','revenuecat',scope,raw->>'store',product,amount,'usd','verified',attempt.id,attempt.created_at) returning * into intent;
   perform sandbox_commerce_v1.native_typed_assert_media(intent);
   if exists(select 1 from sandbox_commerce_v1.transaction_owners x where x.provider='revenuecat' and x.scope_key=scope and x.store=raw->>'store' and x.original_transaction_id=chain)
   then raise exception 'native_store_transaction_already_owned';end if;
   insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
   values('revenuecat',scope,raw->>'store',chain,buyer,product);
   insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
   values(intent.id,'revenuecat',scope,raw->>'store',product,txn,chain,'verified',purchased_at,null,event_at) returning * into receipt;
   insert into sandbox_commerce_v1.native_store_allocations(raw_receipt_id,claim_id,selection_id,reservation_id,attempt_id,protocol_id,protocol_revision,
    core_receipt_id,buyer_id,scope_key,transaction_id,original_transaction_id)
   values(p_raw_receipt_id,c.id,s.id,r.id,attempt.id,p_protocol_id,p_protocol_revision,receipt.id,buyer,scope,txn,chain) returning * into allocation;
   effect_kind:='positive_applied';
   insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,core_receipt_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,receipt.id,c.id,p_projection);
   -- The positive completion and exact link are in the SAME transaction as the
   -- grant. Other unresolved project evidence aborts this whole allocation.
   insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values(receipt.id,project,buyer);
   result:=sandbox_commerce_v1.settle_resource_receipt(receipt.id);
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=receipt.id and buyer_id=buyer;
   if grantrow.revoked_at is not null or result->>'status'<>'settled' or result->>'grantId'<>grantrow.id::text
   then raise exception 'native_store_exact_grant_required';end if;
   perform sandbox_commerce_v1.native_store_record_allocated_terminal(r.id,allocation.id);
   if clock_timestamp()>=owner_until then raise exception 'native_store_owner_deadline';end if;
  end if;
 end if;
 perform sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw_receipt_id);
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
  'status',case when effect_kind='purchase_tombstoned' then 'purchase_tombstoned' else 'processed' end,'effectKind',effect_kind,
  'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
  'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,
  'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
end $$;
create or replace function sandbox_commerce_v1.native_store_play_apply_effect(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;mapping jsonb;prior sandbox_commerce_v1.native_store_play_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_play_handoff_setups;allocation sandbox_commerce_v1.native_store_play_allocations;
 tomb sandbox_commerce_v1.native_store_negative_tombstones;intent sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts;grantrow sandbox_commerce_v1.resource_grants;
 resource sandbox_commerce_v1.resources;version sandbox_commerce_v1.resource_versions;offer sandbox_commerce_v1.offers;
 video sandbox_commerce_v1.video_terms;asset sandbox_commerce_v1.delivery_assets;
 buyer uuid;project text;scope text;txn text;chain text;product text;event_id text;kind text;effect_kind text;
 event_at timestamptz;purchased_at timestamptz;amount bigint;owner_until timestamptz;result jsonb;buyer_authority jsonb;enrollment_until timestamptz;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_projection) is distinct from 'object' or
 (select array_agg(key order by key) from jsonb_object_keys(p_projection) key) is distinct from
 array['amountMinor','cancelReason','currency','eventAt','kind','protocol','purchasedAt','quantity','rawSha256']::text[]
 or p_projection->>'protocol' is distinct from 'native-store-authenticated-effect-v1'
 or not coalesce(p_projection->>'kind' in('purchase','refund'),false) then raise exception 'native_store_effect_projection_shape';end if;
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 mapping:=sandbox_commerce_v1.native_store_play_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from p_projection->>'rawSha256'
 or raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
 or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
 or raw->>'connectionId' is distinct from mapping->>'connectionId' or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
 or o->>'appId' is distinct from raw->>'appId' or o->>'store' is distinct from 'PLAY_STORE' or o->>'environment' is distinct from 'SANDBOX'
  or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
 or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 or o->>'productId' is distinct from mapping->>'productId'
 or o->>'userId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
 or coalesce(length(o->>'eventId'),0)=0
 then raise exception 'native_store_authenticated_original_required' using errcode='42501';end if;
 project:=raw->>'projectId';scope:=mapping->>'scopeKey';buyer:=(o->>'userId')::uuid;
 txn:=o->>'transactionId';chain:=o->>'originalTransactionId';product:=o->>'productId';event_id:=o->>'eventId';kind:=p_projection->>'kind';
 event_at:=(p_projection->>'eventAt')::timestamptz;
 if event_at is null or not isfinite(event_at) or event_at>clock_timestamp() or event_at is distinct from (o->>'eventAt')::timestamptz
 then raise exception 'native_store_effect_time_invalid';end if;
 if not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.raw_receipt_id=p_raw_receipt_id and p.project_id=project and p.raw_sha256=raw->>'rawSha256')
 then raise exception 'native_store_effect_pending_parent_required';end if;
 if exists(select 1 from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id) then raise exception 'native_store_effect_source_conflict';end if;
 select * into prior from sandbox_commerce_v1.native_store_play_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if row(prior.raw_sha256,prior.connection_id,prior.connection_revision,prior.protocol_id,prior.protocol_revision,prior.claim_id,prior.projection)
  is distinct from row(raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,p_claim_id,p_projection)
  then raise exception 'native_store_effect_idempotency_conflict';end if;
  if prior.kind='positive_applied' then
   select * into strict allocation from sandbox_commerce_v1.native_store_play_allocations where raw_receipt_id=p_raw_receipt_id;
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=allocation.core_receipt_id;
  end if;
  return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
   'status','already_processed','effectKind',prior.kind,'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
   'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
 end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 if kind='refund' then
  if p_claim_id is not null or o->>'eventType' is distinct from 'CANCELLATION' or p_projection->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
  or p_projection->'amountMinor' is distinct from 'null'::jsonb or p_projection->'currency' is distinct from 'null'::jsonb
  or p_projection->'purchasedAt' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from 'null'::jsonb
  then raise exception 'native_store_exact_refund_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and original_transaction_id=chain;
  if tomb.id is null then
   insert into sandbox_commerce_v1.native_store_negative_tombstones(scope_key,transaction_id,original_transaction_id,product_id,buyer_id,raw_receipt_id)
   values(scope,txn,chain,product,buyer,p_raw_receipt_id) returning * into tomb;
  elsif row(tomb.buyer_id,tomb.product_id,tomb.transaction_id) is distinct from row(buyer,product,txn)
   then raise exception 'native_store_negative_identity_conflict';end if;
  for allocation in select * from sandbox_commerce_v1.native_store_play_allocations where scope_key=scope and (transaction_id=txn or original_transaction_id=chain) loop
   if allocation.buyer_id<>buyer then raise exception 'native_store_negative_buyer_conflict';end if;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=allocation.core_receipt_id for update nowait;
   if receipt.product_id<>product then raise exception 'native_store_negative_product_conflict';end if;
   insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
   values(buyer,receipt.id,'native_store_refund:'||tomb.id);
   update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where receipt_id=receipt.id and revoked_at is null;
   update sandbox_commerce_v1.receipts set state='refunded',last_event_at=greatest(last_event_at,event_at) where id=receipt.id;
  end loop;
  allocation:=null;grantrow:=null;effect_kind:='negative_applied';
  insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
  values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,null,p_projection);
 else
  if p_claim_id is null or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
   or p_projection->'cancelReason' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from '1'::jsonb
   or p_projection->>'currency' is distinct from 'usd' or jsonb_typeof(p_projection->'amountMinor') is distinct from 'number'
   or p_projection->>'amountMinor' !~ '^[1-9][0-9]*$'
   or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'intakeEnabled' is distinct from 'true'::jsonb
  then raise exception 'native_store_exact_purchase_required';end if;
  amount:=(p_projection->>'amountMinor')::bigint;purchased_at:=(p_projection->>'purchasedAt')::timestamptz;
  if amount>9007199254740991 or not isfinite(purchased_at) or purchased_at>event_at then raise exception 'native_store_purchase_amount_time';end if;
  select * into strict c from sandbox_commerce_v1.native_store_claims where id=p_claim_id and buyer_id=buyer;
  select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=buyer;
  select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=buyer;
  select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=buyer;
  q:=sandbox_commerce_v1.native_store_play_attempt_setup(attempt.id);
  select e.expires_at into strict enrollment_until from sandbox_commerce_v1.native_store_play_handoff_attempts h
   join sandbox_commerce_v1.native_store_play_enrollments e on e.id=h.enrollment_id and e.revision=h.enrollment_revision where h.attempt_id=attempt.id;
  if c.transaction_identifier<>txn or c.product_identifier<>product or r.quote is distinct from s.quote
   or s.quote#>>'{catalog,projectId}' is distinct from project or s.quote#>>'{catalog,appId}' is distinct from raw->>'appId'
   or s.quote#>>'{catalog,store}' is distinct from raw->>'store' or s.quote#>>'{catalog,wireProductId}' is distinct from product
   or q.connection_id::text<>raw->>'connectionId' or q.connection_revision<>(raw->>'connectionRevision')::bigint
   or q.quote_digest is distinct from s.quote->>'quoteDigest' or (s.quote->>'amountMinor')::bigint<>amount or s.quote->>'currency'<>'usd'
   or row(q.platform,q.native_build,q.native_version,q.sdk_version) is distinct from row(mapping->>'platform',mapping->>'nativeBuild',mapping->>'nativeVersion',mapping->>'sdkVersion')
   or purchased_at<date_trunc('milliseconds',attempt.created_at)
   or purchased_at>=enrollment_until
  then raise exception 'native_store_exact_qualified_allocation_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and (transaction_id=txn or original_transaction_id=chain);
  if tomb.id is not null then
   if row(tomb.buyer_id,tomb.product_id) is distinct from row(buyer,product) then raise exception 'native_store_tombstone_identity_conflict';end if;
   effect_kind:='purchase_tombstoned';
   insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,c.id,p_projection);
   perform sandbox_commerce_v1.native_store_play_record_refunded_terminal(r.id,tomb.id);
  else
   perform sandbox_commerce_v1.assert_generation(true);
   buyer_authority:=sandbox_commerce_v1.assert_authority(buyer,attempt.session_id,'buyer');
   select * into strict offer from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(s.quote->>'offerId','offer') for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
   select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=resource.id and revision=offer.resource_revision for share nowait;
   if resource.kind<>'paid_content' or version.kind<>'paid_content' or resource.status<>'published' or offer.status<>'published'
    or resource.revision<>version.revision or resource.creator_id<>version.creator_id or resource.creator_id=buyer
    or s.quote->>'resourceId' is distinct from 'scv1_resource_'||resource.id or (s.quote->>'resourceRevision')::bigint<>version.revision
    or (s.quote->>'offerRevision')::bigint<>offer.revision or s.quote->>'creatorId' is distinct from resource.creator_id::text
    or version.price_minor<>amount or version.currency<>'usd'
   then raise exception 'native_store_current_resource_required';end if;
   select * into strict video from sandbox_commerce_v1.video_terms where resource_id=resource.id and revision=version.revision for share nowait;
   if video.audience<>'paid' then raise exception 'native_store_paid_media_required';end if;
   asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,resource.id,version.revision,resource.creator_id,'video');
   if s.quote->'asset' is distinct from jsonb_build_object('id','scv1_asset_'||asset.id,'incarnation',asset.incarnation,
    'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1')
   then raise exception 'native_store_exact_asset_required';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(resource.creator_id,buyer);
   insert into sandbox_commerce_v1.intents(buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,
    kind,provider,scope_key,store,product_id,amount_minor,currency,state,dispatch_id,dispatched_at)
   values(buyer,attempt.session_id,offer.id,offer.revision,resource.id,version.revision,resource.creator_id,
    'paid_content','revenuecat',scope,raw->>'store',product,amount,'usd','verified',attempt.id,attempt.created_at) returning * into intent;
   perform sandbox_commerce_v1.native_typed_assert_media(intent);
   if exists(select 1 from sandbox_commerce_v1.transaction_owners x where x.provider='revenuecat' and x.scope_key=scope and x.store=raw->>'store' and x.original_transaction_id=chain)
   then raise exception 'native_store_transaction_already_owned';end if;
   insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
   values('revenuecat',scope,raw->>'store',chain,buyer,product);
   insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
   values(intent.id,'revenuecat',scope,raw->>'store',product,txn,chain,'verified',purchased_at,null,event_at) returning * into receipt;
   insert into sandbox_commerce_v1.native_store_play_allocations(raw_receipt_id,claim_id,selection_id,reservation_id,attempt_id,protocol_id,protocol_revision,
    core_receipt_id,buyer_id,scope_key,transaction_id,original_transaction_id)
   values(p_raw_receipt_id,c.id,s.id,r.id,attempt.id,p_protocol_id,p_protocol_revision,receipt.id,buyer,scope,txn,chain) returning * into allocation;
   effect_kind:='positive_applied';
   insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,core_receipt_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,receipt.id,c.id,p_projection);
   -- The positive completion and exact link are in the SAME transaction as the
   -- grant. Other unresolved project evidence aborts this whole allocation.
   insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values(receipt.id,project,buyer);
   result:=sandbox_commerce_v1.settle_resource_receipt(receipt.id);
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=receipt.id and buyer_id=buyer;
   if grantrow.revoked_at is not null or result->>'status'<>'settled' or result->>'grantId'<>grantrow.id::text
   then raise exception 'native_store_exact_grant_required';end if;
   perform sandbox_commerce_v1.native_store_play_record_allocated_terminal(r.id,allocation.id);
   perform sandbox_commerce_v1.assert_fresh(buyer_authority);
   if clock_timestamp()>=owner_until then raise exception 'native_store_owner_deadline';end if;
  end if;
 end if;
 perform sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw_receipt_id);
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
  'status',case when effect_kind='purchase_tombstoned' then 'purchase_tombstoned' else 'processed' end,'effectKind',effect_kind,
  'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
  'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,
  'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
end $$;
create or replace function sandbox_commerce_v1.native_store_paid_video_access(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants;r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;
 asset sandbox_commerce_v1.delivery_assets;video sandbox_commerce_v1.video_terms;
 upload sandbox_commerce_v1.paid_video_uploads;route sandbox_commerce_v1.paid_video_routes;
 ctl sandbox_commerce_v1.paid_video_gateway_controls;authority jsonb;evidence jsonb;delivery jsonb;deadline timestamptz;
begin
 if exists(select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes rr on rr.id=u.route_id
   where u.resource_id=p_resource and rr.provider='cloudflare_r2')
 then perform sandbox_commerce_v1.assert_provider_service();return sandbox_commerce_v1.native_store_paid_video_r2_access(p_user,p_session,p_resource,p_grant);end if;
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(true);
 if p_user is null or p_session is null or p_resource is null or p_grant is null then raise exception 'native_video_binding_required';end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Same generic hold/grant graph as existing private delivery. NOWAIT prevents
 -- acknowledging access while intake or negative application changes it.
 lock table sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds in share mode nowait;
 select * into strict g from sandbox_commerce_v1.resource_grants where id=p_grant and buyer_id=p_user and product_id=p_resource for share nowait;
 select * into strict r from sandbox_commerce_v1.receipts where id=g.receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified' or g.revoked_at is not null
  or i.provider<>'revenuecat' or i.store not in('APP_STORE','PLAY_STORE') or i.currency<>'usd' or i.buyer_id<>p_user
  or row(g.product_id,g.product_revision) is distinct from row(i.resource_id,i.resource_revision)
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 then raise exception 'native_video_exact_receipt_required';end if;
 -- This owner-private helper re-reads allocation, original journal/effect and
 -- mapping/dispatch/connection revocations under the common project lock. A
 -- generic verified receipt or caller-supplied boolean is never sufficient.
 evidence:=sandbox_commerce_v1.native_store_assert_current_allocation(r.id,p_user);
 if evidence->>'allocationId' is null or evidence->>'projectId' is null
  or evidence->>'originalTransactionId' is distinct from r.original_transaction_id
 then raise exception 'native_video_current_allocation_required';end if;
 if (sandbox_commerce_v1.current_resource_grant(p_user,p_resource,g.product_revision)).id is distinct from g.id
 then raise exception 'native_video_exact_current_grant_required';end if;
 delivery:=sandbox_commerce_v1.authorize_resource_delivery(p_user,p_session,p_resource,g.product_revision,p_resource,g.product_revision,'play_video');
 if delivery->>'issuer' is distinct from 'media_signer' or delivery->>'eligibleForIssuer' is distinct from 'true'
 then raise exception 'native_video_media_authority_required';end if;
 select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=g.product_revision;
 asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_resource,g.product_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then raise exception 'native_video_worker_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 if not found then raise exception 'native_video_verifier_unavailable';end if;
 if not ctl.enabled or ctl.route_id is distinct from route.id or not route.active or route.provider<>'s3' or upload.state<>'clean' or upload.moderation<>'clear'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.incarnation,asset.sha256,asset.byte_length)
  or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts o join sandbox_commerce_v1.paid_video_transfers t on t.id=o.transfer_id
   where o.upload_id=upload.id and o.verifier_id=ctl.verifier_id and o.object_version=upload.object_version and t.upload_id=upload.id and t.user_id=upload.creator_id
    and o.observation_raw::jsonb->>'incarnation'=upload.incarnation::text and o.observation_raw::jsonb->>'sha256'=upload.expected_sha256
    and (o.observation_raw::jsonb->>'byteLength')::bigint=upload.expected_byte_length)
 then raise exception 'native_video_current_object_required';end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,to_timestamp((delivery#>>'{binding,expiresAtMs}')::numeric/1000));
 perform sandbox_commerce_v1.assert_fresh(authority);
 if deadline is null or not isfinite(deadline) or clock_timestamp()>=deadline then raise exception 'native_video_access_expired';end if;
 return jsonb_build_object('protocol','nssv1-current-access-gateway-v1','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'resourceId','scv1_resource_'||p_resource,'grantId','scv1_grant_'||g.id,'receiptId','scv1_receipt_'||r.id,
  'originalTransactionId',r.original_transaction_id,'allocationId',evidence->>'allocationId','projectId',evidence->>'projectId',
  'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',route.id,'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,'expectedByteLength',asset.byte_length,'objectVersion',asset.object_version),
  'media',jsonb_build_object('assetId','scv1_asset_'||asset.id,'incarnation',asset.incarnation,'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1'));
end $$;
create or replace function sandbox_commerce_v1.paid_video_review_snapshot(p_upload uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('uploadId','scpv_upload_'||u.id,'creatorId',u.creator_id,'incarnation',u.incarnation,
  'sha256',u.expected_sha256,'byteLength',u.expected_byte_length,'objectVersion',u.object_version,
  'cleanResultSha256',u.clean_result_sha256,'state',u.state,'moderation',u.moderation,
  'object',case when r.provider='cloudflare_r2' then sandbox_commerce_v1.r2_object(u.id) else jsonb_build_object('provider',r.provider,'bucket',r.bucket,'routeId',r.id,'objectKey',u.object_key,
   'incarnation',u.incarnation,'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length,'objectVersion',u.object_version) end,
  'lastReview', (select m.id::text from sandbox_commerce_v1.paid_video_moderation m where m.upload_id=u.id order by recorded_at desc,id desc limit 1))
 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id where u.id=p_upload;
$$;
create or replace function sandbox_commerce_v1.paid_video_review(p_action text,p_raw text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 uid uuid; sid uuid; upload uuid; authority jsonb; reviewer sandbox_commerce_v1.paid_video_reviewers;
 prior sandbox_commerce_v1.paid_video_reviews; snapshot jsonb; req uuid;
begin
 if p_action is null or p_action not in ('inspect','decide','recover') or p_raw is null or octet_length(p_raw)>16384
  or claims->>'role' is distinct from 'authenticated' then raise exception 'paid_video_review_context_invalid'; end if;
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_generation(false);
 body:=p_raw::jsonb; uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid; req:=(body->>'requestId')::uuid;
 if uid is null or sid is null or req is null or body->>'protocol' is distinct from 'scpv-review-request-v1'
  or row(body->>'reviewerId',body->>'sessionId') is distinct from row(uid::text,sid::text)
  or body-(case when p_action='inspect' then array['protocol','requestId','reviewerId','sessionId','uploadId']
    else array['protocol','requestId','reviewerId','sessionId','uploadId','snapshot','decision','evidenceSha256','reviewedAt','humanReviewConfirmed'] end)<>'{}'::jsonb
 then raise exception 'paid_video_review_context_invalid'; end if;
 authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
 select * into strict reviewer from sandbox_commerce_v1.paid_video_reviewers where user_id=uid and active for share nowait;
 upload:=sandbox_commerce_v1.paid_video_id(body->>'uploadId');
 perform 1 from sandbox_commerce_v1.paid_video_uploads where id=upload and creator_id<>uid for update nowait;
 if not found then raise exception 'paid_video_independent_reviewer_required'; end if;
 snapshot:=sandbox_commerce_v1.paid_video_review_snapshot(upload);
 if p_action='inspect' then
  perform sandbox_commerce_v1.assert_fresh(authority); return snapshot;
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('paid-video-review:'||req,687)) then raise exception 'paid_video_review_busy'; end if;
 select * into prior from sandbox_commerce_v1.paid_video_reviews where request_id=req;
 if found then
  if prior.raw<>p_raw or prior.user_id<>uid then raise exception 'paid_video_review_request_conflict'; end if;
  perform sandbox_commerce_v1.assert_fresh(authority);
  return jsonb_build_object('state','acknowledged','requestId',req,'decision',prior.decision,'snapshot',prior.snapshot);
 end if;
 if p_action='recover' then perform sandbox_commerce_v1.assert_fresh(authority); return jsonb_build_object('state','unknown','requestId',req); end if;
 if body->'snapshot' is distinct from snapshot or body->'humanReviewConfirmed' is distinct from 'true'::jsonb
  or body->>'evidenceSha256' is null or body->>'evidenceSha256' !~ '^[a-f0-9]{64}$'
  or (body->>'reviewedAt')::timestamptz is null or not isfinite((body->>'reviewedAt')::timestamptz)
  or (body->>'reviewedAt')::timestamptz not between clock_timestamp()-interval '10 minutes' and clock_timestamp()+interval '5 seconds'
 then raise exception 'paid_video_review_evidence_invalid'; end if;
 if body->>'decision'='clear' then
  if exists(select 1 from sandbox_commerce_v1.paid_video_uploads x join sandbox_commerce_v1.paid_video_routes rr on rr.id=x.route_id where x.id=upload and rr.provider='cloudflare_r2')
  then perform sandbox_commerce_v1.r2_review_object(upload);
  else
   perform sandbox_commerce_v1.paid_video_operations_binding((select binding from sandbox_commerce_v1.paid_video_operations_config where singleton),true);
   perform sandbox_commerce_v1.paid_video_operations_object(upload,(select binding from sandbox_commerce_v1.paid_video_operations_config where singleton));
  end if;
 end if;
 -- Same monotonic moderation effect as the private operator API, in this
 -- already-armed transaction. Calling that API would try to rearm its timer.
 if body->>'decision' is null or body->>'decision' not in ('clear','held','removed')
  or (body->>'decision'='clear' and (snapshot->>'state'<>'clean' or snapshot->>'moderation'='removed'))
 then raise exception 'paid_video_moderation_invalid'; end if;
 insert into sandbox_commerce_v1.paid_video_moderation(upload_id,decision,evidence_sha256) values(upload,body->>'decision',body->>'evidenceSha256');
 update sandbox_commerce_v1.paid_video_uploads set moderation=body->>'decision' where id=upload;
 update sandbox_commerce_v1.delivery_assets set moderation=body->>'decision' where id=(select asset_id from sandbox_commerce_v1.paid_video_uploads where id=upload);
 insert into sandbox_commerce_v1.paid_video_reviews values(req,uid,sid,p_raw,snapshot,body->>'decision',body->>'evidenceSha256',reviewer.authorization_sha256,clock_timestamp());
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('state','acknowledged','requestId',req,'decision',body->>'decision','snapshot',snapshot);
end $$;
reset role;
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_receipt_json(p_upload uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('protocol','scpv-object-receipt-r2-v1','state','recorded','uploadId','scpv_upload_'||u.id,
  'userId',b.user_id,'originalSessionId',b.session_id,'originalConfigurationDigest',p.configuration_digest,
  'requestId',b.request_id,'transferId',b.id,'incarnation',u.incarnation,'sha256',u.expected_sha256,
  'byteLength',u.expected_byte_length,'identity',r.identity,'profileId',p.id,'qualificationSha256',p.qualification_sha256)
 from sandbox_commerce_v1.r2_receipts r join sandbox_commerce_v1.paid_video_uploads u on u.id=r.upload_id
 join sandbox_commerce_v1.r2_dispatches d on d.upload_id=u.id join sandbox_commerce_v1.r2_bindings b on b.id=d.binding_id
 join sandbox_commerce_v1.r2_profiles p on p.id=b.profile_id where u.id=p_upload
$$;
-- All phases re-evaluate current authority, not a cached capability. The token
-- itself is an immutable exact-row binding and is never reusable as a grant.
create function sandbox_commerce_v1.r2_current(p_token jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare b sandbox_commerce_v1.r2_bindings; p sandbox_commerce_v1.r2_profiles;
 u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.resources;
 a jsonb; creator jsonb; access jsonb; obj jsonb; deadline timestamptz; digest text;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 select * into strict b from sandbox_commerce_v1.r2_bindings where id=(p_token->>'bindingId')::uuid for share nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where id=b.profile_id for share nowait;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=b.upload_id for share nowait;
 select * into strict r from sandbox_commerce_v1.resources where id=u.resource_id for share nowait;
 if p_token is distinct from b.token or b.expires_at<=clock_timestamp()
  or not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id)
  or exists(select 1 from sandbox_commerce_v1.paid_video_removals where resource_id=r.id)
  or u.state in('rejected','retired') or u.moderation='removed'
 then raise exception 'paid_video_r2_current_binding_required'; end if;
 creator:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
 if b.operation='range' then
  access:=sandbox_commerce_v1.native_store_paid_video_r2_access(b.user_id,b.session_id,r.id,b.grant_id);
  a:=sandbox_commerce_v1.assert_authority(b.user_id,b.session_id,'delivery');
 elsif b.operation='scan' then
  a:=creator;
  perform 1 from sandbox_commerce_v1.paid_video_tickets t join sandbox_commerce_v1.r2_tickets rt on rt.ticket_id=t.id
   where t.id=b.request_id and t.upload_id=u.id and t.worker_id=p.worker_id and rt.profile_id=p.id
    and rt.object=b.token->'object' and t.positive_consumed_at is null and t.expires_at>clock_timestamp() for share of t,rt nowait;
  if not found or u.state<>'scan_pending' then raise exception 'paid_video_r2_ticket_required'; end if;
 else
  a:=sandbox_commerce_v1.assert_authority(b.user_id,b.session_id,'creator');
  if u.creator_id<>b.user_id or u.state<>'reserved' or u.expires_at<=clock_timestamp() or r.status<>'draft'
  then raise exception 'paid_video_r2_upload_unavailable'; end if;
 end if;
 obj:=sandbox_commerce_v1.r2_object(u.id,b.operation<>'upload');
 if obj is distinct from b.token->'object' or (b.operation<>'upload' and not sandbox_commerce_v1.r2_identity_valid(obj->'identity'))
 then raise exception 'paid_video_r2_identity_changed'; end if;
 deadline:=least(b.expires_at,(a->>'valid_until')::timestamptz,(creator->>'valid_until')::timestamptz);
 if access is not null then deadline:=least(deadline,to_timestamp((access->>'validUntilMs')::numeric/1000)); end if;
 -- Moving five-second lease timestamps are excluded; all actual authority and
 -- immutable allocation/object identity is retained in the before/after digest.
 digest:=encode(sha256(convert_to(jsonb_build_object('profile',to_jsonb(p)-'gateway_key',
  'upload',to_jsonb(u),'resource',to_jsonb(r),'actor',a-'valid_until','creator',creator-'valid_until',
  'access',access-'validUntilMs','object',obj)::text,'UTF8')),'hex');
 perform sandbox_commerce_v1.assert_fresh(a); perform sandbox_commerce_v1.assert_fresh(creator);
 return jsonb_build_object('protocol','scpv-r2-authority-v1','bindingId',b.id,'profileId',p.id,
  'qualificationSha256',p.qualification_sha256,'authorityDigest',digest,'object',obj,
  'validUntilMs',floor(extract(epoch from deadline)*1000),'dispatchAllowed',b.operation='upload');
end $$;
create function sandbox_commerce_v1.r2_admit(p_action text,p_user uuid,p_session uuid,p_upload uuid,p_request uuid,p_configuration text,p_range jsonb,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;u sandbox_commerce_v1.paid_video_uploads;
 b sandbox_commerce_v1.r2_bindings;a jsonb; subject jsonb;token jsonb;raw text;receipt jsonb;at timestamptz;deadline timestamptz;
begin
 if p_action='scan' and current_setting('role',true)='sbx_v1_r2_scanner' then
  perform sandbox_commerce_v1.r2_assert_scanner();
 else perform sandbox_commerce_v1.assert_provider_service();end if;
 perform sandbox_commerce_v1.assert_generation(false);
 if p_action not in('upload','probe','scan','range') or p_action is null or p_request is null
 then raise exception 'paid_video_r2_action_invalid'; end if;
 if p_action='range' and p_upload is null then
  select x.* into strict u from sandbox_commerce_v1.paid_video_uploads x join sandbox_commerce_v1.resource_grants g on g.product_id=x.resource_id
   where g.id=p_grant and g.buyer_id=p_user for share of x,g nowait;
 else select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for share nowait;end if;
 perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
 -- Recovery is immutable history, not renewed object/access authority. Match
 -- the original dispatch and actor before returning a receipt while disabled.
 if p_action='probe' then
  a:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
  select x.* into strict b from sandbox_commerce_v1.r2_bindings x where x.upload_id=u.id and x.operation='upload';
  if u.creator_id<>p_user or b.request_id<>p_request or not exists(select 1 from sandbox_commerce_v1.r2_profiles x
   where x.id=b.profile_id and x.configuration_digest=p_configuration and x.route_id=u.route_id)
  then raise exception 'paid_video_r2_request_conflict';end if;
  receipt:=sandbox_commerce_v1.r2_receipt_json(u.id);
  if receipt is not null then perform sandbox_commerce_v1.assert_fresh(a);return receipt;end if;
 end if;
 if not sandbox_commerce_v1.r2_ready(p_configuration,u.route_id) then raise exception 'paid_video_r2_profile_unavailable'; end if;
 select * into strict p from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration;
 if p_action='scan' then
  if current_setting('role',true)='sbx_v1_r2_scanner' then perform sandbox_commerce_v1.r2_assert_scanner(p.id,p_user);end if;
  if p_user<>p.worker_id or p_session is not null then raise exception 'paid_video_r2_worker_invalid'; end if;
  a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
  subject:=jsonb_build_object('kind','worker','workerId',p.worker_id);
 else
  a:=sandbox_commerce_v1.assert_authority(p_user,p_session,case when p_action='range' then 'delivery' else 'creator' end);
  subject:=jsonb_build_object('kind','session','userId',p_user,'sessionGeneration',p_session);
  if p_action<>'range' and u.creator_id<>p_user then raise exception 'paid_video_r2_owner_required'; end if;
 end if;
 if p_action='range' then
  if p_grant is null or jsonb_typeof(p_range) is distinct from 'object' or not(p_range ?& array['start','end'])
   or (p_range-array['start','end'])<>'{}'::jsonb
   or jsonb_typeof(p_range->'start') is distinct from 'number' or jsonb_typeof(p_range->'end') is distinct from 'number'
   or p_range->>'start' !~ '^(0|[1-9][0-9]*)$' or p_range->>'end' !~ '^(0|[1-9][0-9]*)$'
   or (p_range->>'start')::bigint<0 or (p_range->>'end')::bigint<(p_range->>'start')::bigint
   or (p_range->>'end')::bigint>=u.expected_byte_length or (p_range->>'end')::bigint-(p_range->>'start')::bigint+1>524288
  then raise exception 'paid_video_r2_range_invalid'; end if;
 elsif p_range is not null or p_grant is not null then raise exception 'paid_video_r2_parameters_invalid'; end if;
 if p_action='probe' then
  select * into strict b from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload';
  if b.request_id<>p_request then raise exception 'paid_video_r2_request_conflict'; end if;
  receipt:=sandbox_commerce_v1.r2_receipt_json(u.id);
  if receipt is not null then perform sandbox_commerce_v1.assert_fresh(a);return receipt; end if;
 end if;
 if p_action='upload' then
  if not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-upload:'||u.id,692))
  then raise exception 'paid_video_r2_dispatch_busy' using errcode='55P03';end if;
  if exists(select 1 from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload')
  then raise exception 'paid_video_r2_dispatch_non_retriable'; end if;
 elsif not exists(select 1 from sandbox_commerce_v1.r2_commits where upload_id=u.id and state='acknowledged')
 then raise exception 'paid_video_r2_acknowledged_identity_required'; end if;
 at:=clock_timestamp();deadline:=least(at+interval '5 seconds',(a->>'valid_until')::timestamptz);
 token:=jsonb_build_object('protocol','scpv-r2-gateway-token-v1','operation',p_action,'keyId',p.key_id,'profileId',p.id,
  'qualificationSha256',p.qualification_sha256,'bindingId',gen_random_uuid(),'uploadId','scpv_upload_'||u.id,
  'resourceId','scv1_resource_'||u.resource_id,'requestId',p_request,'configurationDigest',p_configuration,
  'subject',subject,'object',sandbox_commerce_v1.r2_object(u.id,p_action<>'upload'),'range',p_range,'grantId',p_grant,
  'issuedAtMs',floor(extract(epoch from at)*1000),'expiresAtMs',floor(extract(epoch from deadline)*1000));
 insert into sandbox_commerce_v1.r2_bindings values((token->>'bindingId')::uuid,p.id,u.id,p_request,p_user,p_session,p_grant,p_action,token,at,deadline);
 perform sandbox_commerce_v1.r2_current(token);
 raw:=token::text;return jsonb_build_object('raw',raw,'signature',sandbox_commerce_v1.paid_video_hmac(p.gateway_key,raw));
end $$;
create function sandbox_commerce_v1.r2_gateway(p_token jsonb,p_phase text,p_outcome jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b sandbox_commerce_v1.r2_bindings;a jsonb;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'sbx_v1_r2_gateway'
  or current_setting('role',true) is distinct from 'sbx_v1_r2_gateway'
  or current_setting('request.jwt.claims',true)::jsonb->>'profile_id' is distinct from p_token->>'profileId'
  or p_token->>'profileId' is null
 then raise exception 'paid_video_r2_gateway_role_required' using errcode='42501'; end if;
 a:=sandbox_commerce_v1.r2_current(p_token);
 select * into strict b from sandbox_commerce_v1.r2_bindings where id=(p_token->>'bindingId')::uuid;
 if p_phase='before' and p_outcome is null then
  if b.operation='upload' then
   if not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-upload:'||b.upload_id,692))
   then raise exception 'paid_video_r2_dispatch_busy' using errcode='55P03';end if;
   insert into sandbox_commerce_v1.r2_dispatches(upload_id,binding_id) values(b.upload_id,b.id);
  end if;
  return a;
 elsif p_phase='after' and b.operation<>'upload' and p_outcome is null then return a;
 elsif p_phase='commit' and b.operation='upload' then
  perform 1 from sandbox_commerce_v1.r2_dispatches where upload_id=b.upload_id and binding_id=b.id for share nowait;
  if not found or jsonb_typeof(p_outcome) is distinct from 'object' or p_outcome->>'state' not in('acknowledged','unknown','exists_unverified')
   or p_outcome->>'state' is null
   or (p_outcome->>'state'='acknowledged' and ((p_outcome-array['state','identity'])<>'{}'::jsonb or not sandbox_commerce_v1.r2_identity_valid(p_outcome->'identity')))
   or (p_outcome->>'state'<>'acknowledged' and p_outcome-array['state']<>'{}'::jsonb)
  then raise exception 'paid_video_r2_commit_invalid'; end if;
  insert into sandbox_commerce_v1.r2_commits(upload_id,state,identity) values(b.upload_id,p_outcome->>'state',p_outcome->'identity');
  return jsonb_build_object('protocol','scpv-r2-commit-v1','state',p_outcome->>'state','bindingId',b.id);
 end if;
 raise exception 'paid_video_r2_phase_invalid';
end $$;
create function sandbox_commerce_v1.r2_reconcile(p_raw text,p_signature text,p_user uuid,p_session uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v sandbox_commerce_v1.paid_video_verifiers;p sandbox_commerce_v1.r2_profiles;
 b sandbox_commerce_v1.r2_bindings;u sandbox_commerce_v1.paid_video_uploads;o jsonb;token jsonb;a jsonb;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 if p_raw is null or octet_length(p_raw)>16384 then raise exception 'paid_video_r2_observation_invalid'; end if;
 o:=p_raw::jsonb;token:=o->'token';
 if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['protocol','verifierId','token','identity','sha256','byteLength','checkedAtMs','expiresAtMs'])
  or (o-array['protocol','verifierId','token','identity','sha256','byteLength','checkedAtMs','expiresAtMs'])<>'{}'::jsonb
  or o->>'protocol' is distinct from 'scpv-object-observation-r2-v1' then raise exception 'paid_video_r2_observation_invalid'; end if;
 select * into strict b from sandbox_commerce_v1.r2_bindings where id=(o#>>'{token,bindingId}')::uuid;
 select * into strict p from sandbox_commerce_v1.r2_profiles where id=b.profile_id;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=p.verifier_id and active for share nowait;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,p_raw),p_signature)
 then raise exception 'paid_video_r2_verifier_signature_invalid'; end if;
 a:=sandbox_commerce_v1.r2_current(token);
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=b.upload_id for update nowait;
 if b.operation<>'probe' or b.user_id is distinct from p_user or b.session_id is distinct from p_session
  or o->>'verifierId' is distinct from v.id::text or o->'identity' is distinct from token#>'{object,identity}'
  or o->>'sha256' is distinct from u.expected_sha256 or o->'byteLength' is distinct from to_jsonb(u.expected_byte_length)
  or jsonb_typeof(o->'checkedAtMs') is distinct from 'number' or jsonb_typeof(o->'expiresAtMs') is distinct from 'number'
  or (o->>'checkedAtMs')::numeric<(token->>'issuedAtMs')::numeric or (o->>'checkedAtMs')::numeric>extract(epoch from clock_timestamp())*1000
  or (o->>'expiresAtMs')::numeric>(token->>'expiresAtMs')::numeric or (o->>'expiresAtMs')::numeric<=extract(epoch from clock_timestamp())*1000
 then raise exception 'paid_video_r2_observation_binding_invalid'; end if;
 if not exists(select 1 from sandbox_commerce_v1.r2_receipts where upload_id=u.id) then
  insert into sandbox_commerce_v1.r2_receipts(upload_id,binding_id,verifier_id,identity,raw_body,signature)
   values(u.id,b.id,v.id,o->'identity',p_raw,p_signature);
  update sandbox_commerce_v1.paid_video_uploads set r2_identity=o->'identity' where id=u.id;
 end if;
 return sandbox_commerce_v1.r2_receipt_json(u.id);
end $$;
revoke all on function sandbox_commerce_v1.r2_receipt_json(uuid),sandbox_commerce_v1.r2_current(jsonb),
 sandbox_commerce_v1.r2_admit(text,uuid,uuid,uuid,uuid,text,jsonb,uuid),sandbox_commerce_v1.r2_gateway(jsonb,text,jsonb),sandbox_commerce_v1.r2_reconcile(text,text,uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway;
reset role;
create function public.native_paid_video_r2_admit_v1(p_action text,p_user_id uuid,p_session_id uuid,p_upload_id uuid,p_request_id uuid,p_configuration_digest text,p_range jsonb,p_grant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.r2_admit(p_action,p_user_id,p_session_id,p_upload_id,p_request_id,p_configuration_digest,p_range,p_grant_id);end $$;
create function public.native_paid_video_r2_gateway_v1(p_token jsonb,p_phase text,p_outcome jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();return sandbox_commerce_v1.r2_gateway(p_token,p_phase,p_outcome);end $$;
create function public.native_paid_video_r2_reconcile_v1(p_raw_body text,p_signature text,p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();return sandbox_commerce_v1.r2_reconcile(p_raw_body,p_signature,p_user_id,p_session_id);end $$;
alter function public.native_paid_video_r2_admit_v1(text,uuid,uuid,uuid,uuid,text,jsonb,uuid) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_reconcile_v1(text,text,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_admit_v1(text,uuid,uuid,uuid,uuid,text,jsonb,uuid),public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb),public.native_paid_video_r2_reconcile_v1(text,text,uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway;
grant execute on function public.native_paid_video_r2_admit_v1(text,uuid,uuid,uuid,uuid,text,jsonb,uuid),public.native_paid_video_r2_reconcile_v1(text,text,uuid,uuid) to service_role;
grant usage on schema public to sbx_v1_r2_gateway;
grant execute on function public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb) to sbx_v1_r2_gateway;
create function public.native_paid_video_r2_route_v1(p_user_id uuid,p_session_id uuid,p_upload_id uuid,p_configuration_digest text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;r sandbox_commerce_v1.paid_video_routes;a jsonb;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 a:=sandbox_commerce_v1.assert_authority(p_user_id,p_session_id,'delivery');
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload_id and creator_id=p_user_id for share nowait;
 select * into strict r from sandbox_commerce_v1.paid_video_routes where id=u.route_id for share nowait;
 perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration_digest);
 if (r.provider='cloudflare_r2' and not exists(select 1 from sandbox_commerce_v1.r2_profiles x where x.configuration_digest=p_configuration_digest and x.route_id=r.id))
  or (r.provider='s3' and not (
   exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles x where x.configuration_digest=p_configuration_digest and x.route_id=r.id)
   or exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles x join sandbox_commerce_v1.paid_video_gateway_controls ctl on ctl.singleton and ctl.route_id=r.id where x.configuration_digest=p_configuration_digest)))
  or r.provider not in('s3','cloudflare_r2') then raise exception 'paid_video_storage_route_unavailable';end if;
 perform sandbox_commerce_v1.assert_fresh(a);
 return jsonb_build_object('protocol','scpv-storage-route-v1','mode',case when r.provider='s3' then 's3' else 'r2-native-v1' end);
end $$;
alter function public.native_paid_video_r2_route_v1(uuid,uuid,uuid,text) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_route_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_route_v1(uuid,uuid,uuid,text) to service_role;

set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_assert_scanner(p_profile uuid default null,p_worker uuid default null) returns void language plpgsql set search_path='' as $$
declare claims jsonb:=current_setting('request.jwt.claims',true)::jsonb;begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'sbx_v1_r2_scanner'
  or current_setting('role',true) is distinct from 'sbx_v1_r2_scanner'
  or coalesce(claims->>'profile_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(claims->>'worker_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or (p_profile is not null and claims->>'profile_id' is distinct from p_profile::text)
  or (p_worker is not null and claims->>'worker_id' is distinct from p_worker::text)
 then raise exception 'paid_video_r2_scanner_role_required' using errcode='42501';end if;
end $$;
create function sandbox_commerce_v1.r2_lease(p_upload uuid,p_worker uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;p sandbox_commerce_v1.r2_profiles;t sandbox_commerce_v1.paid_video_tickets;a jsonb;o jsonb;
begin
 perform sandbox_commerce_v1.r2_assert_scanner();perform sandbox_commerce_v1.assert_generation(true);
 if p_worker is null or not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-worker:'||p_worker,692))
 then raise exception 'paid_video_r2_worker_busy';end if;
 if exists(select 1 from sandbox_commerce_v1.paid_video_tickets tt join sandbox_commerce_v1.paid_video_uploads x on x.id=tt.upload_id
  where tt.worker_id=p_worker and tt.expires_at>clock_timestamp() and tt.positive_consumed_at is null and x.state='scan_pending')
 then raise exception 'paid_video_r2_worker_already_leased';end if;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for update nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where route_id=u.route_id and worker_id=p_worker for share nowait;
 perform sandbox_commerce_v1.r2_assert_scanner(p.id,p.worker_id);
 if not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id) or u.state<>'scan_pending'
  or u.moderation='removed' or u.expires_at<=clock_timestamp()
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=u.id and rr.identity=u.r2_identity)
  or exists(select 1 from sandbox_commerce_v1.paid_video_tickets where upload_id=u.id and expires_at>clock_timestamp())
 then raise exception 'paid_video_r2_scan_unavailable';end if;
 a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');o:=sandbox_commerce_v1.r2_object(u.id);
 insert into sandbox_commerce_v1.paid_video_tickets(upload_id,worker_id) values(u.id,p.worker_id) returning * into t;
 insert into sandbox_commerce_v1.r2_tickets values(t.id,p.id,o);
 perform sandbox_commerce_v1.assert_fresh(a);
 return jsonb_build_object('protocol','scpv-worker-ticket-r2-v1','ticketId',t.id,'uploadId','scpv_upload_'||u.id,
  'workerId',p.worker_id,'qualificationSha256',p.qualification_sha256,'profile','scpv-mp4-h264-aac-v1',
  'issuedAt',t.issued_at,'expiresAt',t.expires_at,'object',o);
end $$;
revoke all on function sandbox_commerce_v1.r2_assert_scanner(uuid,uuid),sandbox_commerce_v1.r2_lease(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
create function sandbox_commerce_v1.r2_review_object(p_upload uuid) returns void
language plpgsql volatile set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;p sandbox_commerce_v1.r2_profiles;r sandbox_commerce_v1.r2_receipts;
 s sandbox_commerce_v1.paid_video_scan_results;w sandbox_commerce_v1.paid_video_workers;v sandbox_commerce_v1.paid_video_verifiers;a jsonb;
begin
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for share nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where route_id=u.route_id for share nowait;
 if not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id) or u.state<>'clean' or u.moderation='removed'
  or u.daily_definitions_at<clock_timestamp()-interval '48 hours' then raise exception 'paid_video_r2_review_unavailable';end if;
 a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
 select * into strict r from sandbox_commerce_v1.r2_receipts where upload_id=u.id and identity=u.r2_identity and verifier_id=p.verifier_id;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=p.verifier_id;
 select * into strict w from sandbox_commerce_v1.paid_video_workers where id=p.worker_id;
 select * into strict s from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 and accepted_positive;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,r.raw_body),r.signature)
  or not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(w.hmac_key,s.raw_body),s.signature)
  or s.raw_body::jsonb->'object' is distinct from sandbox_commerce_v1.r2_object(u.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_tickets rt join sandbox_commerce_v1.paid_video_tickets tt on tt.id=rt.ticket_id
   where rt.ticket_id=s.ticket_id and rt.profile_id=p.id and tt.worker_id=p.worker_id and tt.upload_id=u.id and rt.object=s.raw_body::jsonb->'object')
 then raise exception 'paid_video_r2_review_evidence_invalid';end if;
 perform sandbox_commerce_v1.assert_fresh(a);
end $$;
revoke all on function sandbox_commerce_v1.r2_review_object(uuid) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
reset role;
create function public.native_paid_video_r2_worker_v1(p_action text,p_upload_id uuid default null,p_worker_id uuid default null,p_raw_body text default null,p_signature text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 if p_action='lease' and p_upload_id is not null and p_worker_id is not null and p_raw_body is null and p_signature is null
 then return sandbox_commerce_v1.r2_lease(p_upload_id,p_worker_id);
 elsif p_action='complete' and p_upload_id is null and p_worker_id is null and p_raw_body is not null and p_signature is not null
 then
  perform sandbox_commerce_v1.r2_assert_scanner(
   (select rt.profile_id from sandbox_commerce_v1.r2_tickets rt where rt.ticket_id=(p_raw_body::jsonb->>'ticketId')::uuid),
   (p_raw_body::jsonb->>'workerId')::uuid);
  perform sandbox_commerce_v1.r2_scan_ingest(p_raw_body,p_signature);
  return jsonb_build_object('protocol','scpv-r2-worker-completion-v1','state','recorded',
   'resultSha256',encode(sha256(convert_to(p_raw_body,'UTF8')),'hex'));
 end if;
 raise exception 'paid_video_r2_worker_action_invalid';
end $$;
create function public.native_paid_video_r2_scan_admit_v1(p_upload_id uuid,p_ticket_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;t sandbox_commerce_v1.paid_video_tickets;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 select x.* into strict t from sandbox_commerce_v1.paid_video_tickets x where x.id=p_ticket_id and x.upload_id=p_upload_id;
 select x.* into strict p from sandbox_commerce_v1.r2_profiles x join sandbox_commerce_v1.r2_tickets rt on rt.profile_id=x.id where rt.ticket_id=t.id;
 perform sandbox_commerce_v1.r2_assert_scanner(p.id,t.worker_id);
 return sandbox_commerce_v1.r2_admit('scan',t.worker_id,null,t.upload_id,t.id,p.configuration_digest,null,null);
end $$;
alter function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_scan_admit_v1(uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text),public.native_paid_video_r2_scan_admit_v1(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant usage on schema public to sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text),public.native_paid_video_r2_scan_admit_v1(uuid,uuid) to sbx_v1_r2_scanner;
create function public.native_paid_video_r2_next_v1(p_worker_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare candidate record;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 perform sandbox_commerce_v1.r2_assert_scanner(null,p_worker_id);
 perform sandbox_commerce_v1.assert_generation(true);
 if p_worker_id is null or not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-worker:'||p_worker_id,692))
 then raise exception 'paid_video_r2_worker_busy';end if;
 if exists(select 1 from sandbox_commerce_v1.paid_video_tickets t join sandbox_commerce_v1.paid_video_uploads u on u.id=t.upload_id
  where t.worker_id=p_worker_id and t.expires_at>clock_timestamp() and t.positive_consumed_at is null and u.state='scan_pending')
 then return null;end if;
 for candidate in select u.id from sandbox_commerce_v1.paid_video_uploads u
  join sandbox_commerce_v1.r2_profiles p on p.route_id=u.route_id and p.worker_id=p_worker_id and p.enabled
   and p.id=(current_setting('request.jwt.claims',true)::jsonb->>'profile_id')::uuid
  join sandbox_commerce_v1.r2_receipts r on r.upload_id=u.id and r.identity=u.r2_identity
  join sandbox_commerce_v1.r2_commits c on c.upload_id=u.id and c.state='acknowledged' and c.identity=r.identity
  where u.state='scan_pending' and u.moderation<>'removed' and u.expires_at>clock_timestamp()
   and not exists(select 1 from sandbox_commerce_v1.paid_video_tickets t where t.upload_id=u.id and t.expires_at>clock_timestamp())
  order by u.created_at,u.id limit 20 for update of u skip locked
 loop
  begin return sandbox_commerce_v1.r2_lease(candidate.id,p_worker_id);
  exception when insufficient_privilege then null;end;
 end loop;
 return null;
end $$;
alter function public.native_paid_video_r2_next_v1(uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_next_v1(uuid) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_next_v1(uuid) to sbx_v1_r2_scanner;

set local role sbx_v1_core_owner;
do $lock$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='sandbox_commerce_v1' and p.proname in ('native_r2_assert_media','native_typed_assert_media','native_store_paid_video_r2_access','r2_scan_ingest') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner',f.signature);end loop;end $lock$;
reset role;-- END EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/source.sql

-- BEGIN EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/deployment-revoke.sql sha256=dd22564156d1fa27d6fdc021407b9cf052575bcc2377191c6623baee39deb505
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 or (select count(*)<>2 or not bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 or exists(select 1 from pg_auth_members where roleid in('sbx_v1_r2_gateway'::regrole,'sbx_v1_r2_scanner'::regrole) and (member<>'postgres'::regrole or set_option or inherit_option))
 or has_function_privilege('service_role','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE')
 or has_function_privilege('service_role','public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text)','EXECUTE')
 or not has_function_privilege('sbx_v1_r2_gateway','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE')
 or not has_function_privilege('sbx_v1_r2_scanner','public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text)','EXECUTE')
 then raise exception 'r2_forward_permissions_not_finalized';end if;
end $$;
-- END EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/deployment-revoke.sql

-- BEGIN EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/private-state.sql sha256=dbb7f30313156a637fdf439c31b44700c8f47f75cf8404acbe283471c3c0bd7a
-- Fixed read-only observation; never grant raw private access.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
 or not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
 or to_regclass('sandbox_commerce_v1.r2_profiles') is null or to_regclass('sandbox_commerce_v1.r2_bindings') is null or to_regclass('sandbox_commerce_v1.r2_dispatches') is null or to_regclass('sandbox_commerce_v1.r2_commits') is null or to_regclass('sandbox_commerce_v1.r2_receipts') is null or to_regclass('sandbox_commerce_v1.r2_tickets') is null
 or has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 then raise exception 'r2_private_reader_prerequisites_required';end if;
end $$;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_paid_video_r2_private_state_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$declare metadata jsonb;begin
 if session_user<>'supabase_read_only_user' or current_user<>'sbx_v1_core_owner'
 or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
 or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or exists(select 1 from pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'r2_private_read_context_required' using errcode='42501';end if;
 with profiles as materialized(select id,configuration_digest,route_id,worker_id,verifier_id,key_id,gateway_key,qualification_sha256,capacity_evidence_sha256,qualified_max_bytes,enabled from sandbox_commerce_v1.r2_profiles limit 2),
 routes as materialized(select id,provider,bucket,route_evidence_sha256,active from sandbox_commerce_v1.paid_video_routes limit 65),
 workers as materialized(select id,hmac_key,qualified_binary_sha256,active from sandbox_commerce_v1.paid_video_workers limit 65),
 verifiers as materialized(select id,hmac_key,evidence_sha256,active from sandbox_commerce_v1.paid_video_verifiers limit 65),
 memberships as materialized(select roleid::regrole::text role_name,member::regrole::text member_name,grantor::regrole::text grantor_name,admin_option,inherit_option,set_option from pg_auth_members
  where roleid in('sbx_v1_r2_gateway'::regrole,'sbx_v1_r2_scanner'::regrole) limit 33),
 bounds as materialized(select (select count(*)<=1 from profiles) and (select count(*)<=64 from routes)
  and (select count(*)<=64 from workers) and (select count(*)<=64 from verifiers) and (select count(*)<=32 from memberships) ok)
 select jsonb_build_object('withinBounds',b.ok,'profileCount',(select count(*) from profiles),
  'routeCount',(select count(*) from routes),'workerCount',(select count(*) from workers),'verifierCount',(select count(*) from verifiers),'membershipCount',(select count(*) from memberships),
  'profileDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from (select encode(sha256(convert_to((to_jsonb(p)-'gateway_key'-'enabled')::text,'UTF8')),'hex') h from profiles p where (select ok from bounds)) bounded_hashes) end,
  'routeDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from (select encode(sha256(convert_to((to_jsonb(r)-'active')::text,'UTF8')),'hex') h from routes r where (select ok from bounds)) bounded_hashes) end,
  'workerDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from (select encode(sha256(convert_to((to_jsonb(w)-'hmac_key'-'active')::text,'UTF8')),'hex') h from workers w where (select ok from bounds)) bounded_hashes) end,
  'verifierDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from (select encode(sha256(convert_to((to_jsonb(v)-'hmac_key'-'active')::text,'UTF8')),'hex') h from verifiers v where (select ok from bounds)) bounded_hashes) end,
  'membershipsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from (select encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex') h from memberships m where (select ok from bounds)) bounded_hashes) end,
  'profileBindingsCurrent',b.ok and exists(select 1 from profiles p join routes r on r.id=p.route_id join workers w on w.id=p.worker_id join verifiers v on v.id=p.verifier_id
   where r.active and r.provider='cloudflare_r2' and r.bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and w.active and v.active
   and w.hmac_key<>v.hmac_key and w.hmac_key<>p.gateway_key and v.hmac_key<>p.gateway_key
   and not exists(select 1 from workers x where x.hmac_key in(v.hmac_key,p.gateway_key))
   and not exists(select 1 from verifiers x where x.hmac_key=p.gateway_key)
   and not exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles x where x.configuration_digest=p.configuration_digest)))
 into metadata from bounds b;
 return jsonb_build_object('protocol','native-paid-video-r2-private-state-v1','reader',session_user,'transactionReadOnly',true,
  'profileEnabled',exists(select 1 from sandbox_commerce_v1.r2_profiles where enabled limit 1),
  'lifecycleActive',exists(select 1 from sandbox_commerce_v1.lifecycle where singleton and state='active'),
  'rolesSafe',(select count(*)=2 and bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner')),
  'metadata',metadata,'empty',jsonb_build_object('r2_profiles',not exists(select 1 from sandbox_commerce_v1.r2_profiles limit 1),'r2_bindings',not exists(select 1 from sandbox_commerce_v1.r2_bindings limit 1),'r2_dispatches',not exists(select 1 from sandbox_commerce_v1.r2_dispatches limit 1),'r2_commits',not exists(select 1 from sandbox_commerce_v1.r2_commits limit 1),'r2_receipts',not exists(select 1 from sandbox_commerce_v1.r2_receipts limit 1),'r2_tickets',not exists(select 1 from sandbox_commerce_v1.r2_tickets limit 1)));
end $$;
revoke all on function public.native_paid_video_r2_private_state_v1() from public,anon,authenticated,service_role,postgres,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_private_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 or (select count(*)<>2 or bool_or(a.grantee not in('sbx_v1_core_owner'::regrole,'supabase_read_only_user'::regrole) or a.grantor<>'sbx_v1_core_owner'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.native_paid_video_r2_private_state_v1()'::regprocedure)
 then raise exception 'r2_private_reader_finalization_required';end if;
end $$;
-- END EXACT SOURCE isolated-runtime/native-paid-video-r2-v1/private-state.sql

-- Journal is independently observed using its existing bounded reader.
 -- No new journal-owner membership or direct journal read grant is introduced.
 grant sbx_v1_core_owner to postgres with inherit false,set true;
 set local role sbx_v1_core_owner;
 lock table sandbox_commerce_v1.native_store_play_handoff_control,sandbox_commerce_v1.lifecycle,sandbox_commerce_v1.native_store_quote_controls,sandbox_commerce_v1.paid_video_gateway_controls,sandbox_commerce_v1.test_store_controls,sandbox_commerce_v1.test_store_v2_controls,sandbox_commerce_v1.test_store_v3_controls,sandbox_commerce_v1.test_store_qualification_controls,sandbox_commerce_v1.native_store_catalog_bindings,sandbox_commerce_v1.native_store_catalog_retirements,sandbox_commerce_v1.native_store_selections,sandbox_commerce_v1.native_store_claims,sandbox_commerce_v1.native_store_reservations,sandbox_commerce_v1.native_store_dispatch_attempts,sandbox_commerce_v1.native_store_core_links,sandbox_commerce_v1.native_store_pending_raw,sandbox_commerce_v1.native_store_protocol_qualifications,sandbox_commerce_v1.native_store_protocol_revocations,sandbox_commerce_v1.native_store_qualified_attempts,sandbox_commerce_v1.native_store_settlement_protocols,sandbox_commerce_v1.native_store_settlement_revocations,sandbox_commerce_v1.native_store_negative_tombstones,sandbox_commerce_v1.native_store_allocations,sandbox_commerce_v1.native_store_raw_effects,sandbox_commerce_v1.native_store_reservation_terminals,sandbox_commerce_v1.resources,sandbox_commerce_v1.resource_versions,sandbox_commerce_v1.resource_bindings,sandbox_commerce_v1.catalog,sandbox_commerce_v1.offers,sandbox_commerce_v1.intents,sandbox_commerce_v1.requests,sandbox_commerce_v1.receipts,sandbox_commerce_v1.receipt_events,sandbox_commerce_v1.transaction_owners,sandbox_commerce_v1.grants,sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds,sandbox_commerce_v1.delivery_assets,sandbox_commerce_v1.delivery_asset_scans,sandbox_commerce_v1.video_terms,sandbox_commerce_v1.paid_video_routes,sandbox_commerce_v1.paid_video_workers,sandbox_commerce_v1.paid_video_uploads,sandbox_commerce_v1.paid_video_tickets,sandbox_commerce_v1.paid_video_scan_results,sandbox_commerce_v1.paid_video_moderation,sandbox_commerce_v1.paid_video_requests,sandbox_commerce_v1.paid_video_catalog,sandbox_commerce_v1.paid_video_transfers,sandbox_commerce_v1.paid_video_verifiers,sandbox_commerce_v1.paid_video_object_receipts,sandbox_commerce_v1.paid_video_gateway_requests,sandbox_commerce_v1.paid_video_gateway_transfers,sandbox_commerce_v1.paid_video_receipt_links,sandbox_commerce_v1.native_store_play_handoff_setups,sandbox_commerce_v1.native_store_play_setup_revocations,sandbox_commerce_v1.native_store_play_enrollments,sandbox_commerce_v1.native_store_play_enrollment_revocations,sandbox_commerce_v1.native_store_play_handoff_attempts,sandbox_commerce_v1.native_store_play_settlement_protocols,sandbox_commerce_v1.native_store_play_settlement_revocations,sandbox_commerce_v1.native_store_play_allocations,sandbox_commerce_v1.native_store_play_raw_effects,sandbox_commerce_v1.paid_video_native_authoring_profiles,sandbox_commerce_v1.paid_video_native_catalog_templates,sandbox_commerce_v1.paid_video_native_template_retirements,sandbox_commerce_v1.paid_video_native_publications,sandbox_commerce_v1.paid_video_operations_config,sandbox_commerce_v1.paid_video_operations_requests,sandbox_commerce_v1.paid_video_reviewers,sandbox_commerce_v1.paid_video_reviews,sandbox_commerce_v1.paid_video_removals in share row exclusive mode nowait;
 do $core_state$ begin
 if not (select count(*)=1 and bool_and(singleton and (not enabled)) from sandbox_commerce_v1.native_store_play_handoff_control) then raise exception 'authoring_control_not_disabled:native_store_play_handoff_control';end if;
if not (select count(*)=1 and bool_and(singleton and (state='disabled')) from sandbox_commerce_v1.lifecycle) then raise exception 'authoring_control_not_disabled:lifecycle';end if;
if not (select count(*)=1 and bool_and(singleton and (not preparation_enabled)) from sandbox_commerce_v1.native_store_quote_controls) then raise exception 'authoring_control_not_disabled:native_store_quote_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not enabled and route_id is null and verifier_id is null and worker_id is null and qualification_sha256 is null)) from sandbox_commerce_v1.paid_video_gateway_controls) then raise exception 'authoring_control_not_disabled:paid_video_gateway_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not ingress_enabled and not initiation_enabled and connection_id is null and connection_revision is null)) from sandbox_commerce_v1.test_store_controls) then raise exception 'authoring_control_not_disabled:test_store_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null)) from sandbox_commerce_v1.test_store_v2_controls) then raise exception 'authoring_control_not_disabled:test_store_v2_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null)) from sandbox_commerce_v1.test_store_v3_controls) then raise exception 'authoring_control_not_disabled:test_store_v3_controls';end if;
if not (select count(*)=1 and bool_and(singleton and (phase='disabled' and connection_id is null and connection_revision is null and started_at is null and sealed_at is null and seal_sha256 is null)) from sandbox_commerce_v1.test_store_qualification_controls) then raise exception 'authoring_control_not_disabled:test_store_qualification_controls';end if;
 if not (not exists(select 1 from sandbox_commerce_v1.native_store_catalog_bindings limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_catalog_bindings';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_catalog_retirements';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_selections limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_selections';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_claims limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_claims';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_reservations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_reservations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_dispatch_attempts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_core_links limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_core_links';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_pending_raw';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_protocol_qualifications limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_protocol_qualifications';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_protocol_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_qualified_attempts limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_qualified_attempts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_settlement_protocols limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_settlement_protocols';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_settlement_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_negative_tombstones limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_negative_tombstones';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_allocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_allocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_raw_effects';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_reservation_terminals';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resources limit 1)) then raise exception 'authoring_old_native_not_empty:resources';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_versions limit 1)) then raise exception 'authoring_old_native_not_empty:resource_versions';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_bindings limit 1)) then raise exception 'authoring_old_native_not_empty:resource_bindings';end if;
if not (not exists(select 1 from sandbox_commerce_v1.catalog limit 1)) then raise exception 'authoring_old_native_not_empty:catalog';end if;
if not (not exists(select 1 from sandbox_commerce_v1.offers limit 1)) then raise exception 'authoring_old_native_not_empty:offers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.intents limit 1)) then raise exception 'authoring_old_native_not_empty:intents';end if;
if not (not exists(select 1 from sandbox_commerce_v1.requests limit 1)) then raise exception 'authoring_old_native_not_empty:requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.receipts limit 1)) then raise exception 'authoring_old_native_not_empty:receipts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.receipt_events limit 1)) then raise exception 'authoring_old_native_not_empty:receipt_events';end if;
if not (not exists(select 1 from sandbox_commerce_v1.transaction_owners limit 1)) then raise exception 'authoring_old_native_not_empty:transaction_owners';end if;
if not (not exists(select 1 from sandbox_commerce_v1.grants limit 1)) then raise exception 'authoring_old_native_not_empty:grants';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_grants limit 1)) then raise exception 'authoring_old_native_not_empty:resource_grants';end if;
if not (not exists(select 1 from sandbox_commerce_v1.resource_delivery_holds limit 1)) then raise exception 'authoring_old_native_not_empty:resource_delivery_holds';end if;
if not (not exists(select 1 from sandbox_commerce_v1.delivery_assets limit 1)) then raise exception 'authoring_old_native_not_empty:delivery_assets';end if;
if not (not exists(select 1 from sandbox_commerce_v1.delivery_asset_scans limit 1)) then raise exception 'authoring_old_native_not_empty:delivery_asset_scans';end if;
if not (not exists(select 1 from sandbox_commerce_v1.video_terms limit 1)) then raise exception 'authoring_old_native_not_empty:video_terms';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_routes limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_routes';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_workers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_workers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_uploads limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_uploads';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_tickets limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_tickets';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_scan_results limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_scan_results';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_moderation limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_moderation';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_requests limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_catalog limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_catalog';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_transfers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_transfers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_verifiers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_verifiers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_object_receipts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_gateway_requests limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_gateway_requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_gateway_transfers limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_gateway_transfers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_receipt_links limit 1)) then raise exception 'authoring_old_native_not_empty:paid_video_receipt_links';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_setups limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_handoff_setups';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_setup_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_setup_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollments limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_enrollments';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_enrollment_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_enrollment_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_handoff_attempts limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_handoff_attempts';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_protocols limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_settlement_protocols';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_settlement_revocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_settlement_revocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_allocations limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_allocations';end if;
if not (not exists(select 1 from sandbox_commerce_v1.native_store_play_raw_effects limit 1)) then raise exception 'authoring_old_native_not_empty:native_store_play_raw_effects';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_authoring_profiles';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_catalog_templates';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_template_retirements limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_template_retirements';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_native_publications limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_native_publications';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_operations_config limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_operations_config';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_operations_requests limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_operations_requests';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_reviewers limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_reviewers';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_reviews limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_reviews';end if;
if not (not exists(select 1 from sandbox_commerce_v1.paid_video_removals limit 1)) then raise exception 'authoring_new_data_not_empty:sandbox_commerce_v1.paid_video_removals';end if;
 end $core_state$;
 reset role;grant sbx_v1_core_owner to postgres with inherit false,set false;
 do $restored$ begin if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') or exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)) then raise exception 'authoring_owner_interval_leaked';end if; end $restored$;
 grant sbx_v1_core_owner to postgres with inherit false,set true;
 set local role sbx_v1_core_owner;
 lock table sandbox_commerce_v1.r2_profiles,sandbox_commerce_v1.r2_bindings,sandbox_commerce_v1.r2_dispatches,sandbox_commerce_v1.r2_commits,sandbox_commerce_v1.r2_receipts,sandbox_commerce_v1.r2_tickets in share row exclusive mode nowait;
 do $r2_empty$ begin
 if exists(select 1 from sandbox_commerce_v1.r2_profiles limit 1) then raise exception 'r2_data_not_empty:sandbox_commerce_v1.r2_profiles';end if;
if exists(select 1 from sandbox_commerce_v1.r2_bindings limit 1) then raise exception 'r2_data_not_empty:sandbox_commerce_v1.r2_bindings';end if;
if exists(select 1 from sandbox_commerce_v1.r2_dispatches limit 1) then raise exception 'r2_data_not_empty:sandbox_commerce_v1.r2_dispatches';end if;
if exists(select 1 from sandbox_commerce_v1.r2_commits limit 1) then raise exception 'r2_data_not_empty:sandbox_commerce_v1.r2_commits';end if;
if exists(select 1 from sandbox_commerce_v1.r2_receipts limit 1) then raise exception 'r2_data_not_empty:sandbox_commerce_v1.r2_receipts';end if;
if exists(select 1 from sandbox_commerce_v1.r2_tickets limit 1) then raise exception 'r2_data_not_empty:sandbox_commerce_v1.r2_tickets';end if;
 end $r2_empty$;
 reset role;grant sbx_v1_core_owner to postgres with inherit false,set false;
 do $r2_roles$ begin
 if (select count(*)<>2 or not bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 or exists(select 1 from pg_auth_members where roleid in('sbx_v1_r2_gateway'::regrole,'sbx_v1_r2_scanner'::regrole) and (member<>'postgres'::regrole or set_option or inherit_option))
 then raise exception 'r2_runtime_roles_not_closed';end if;
 end $r2_roles$;
-- Original source checks run after owner SET/INHERIT and schema CREATE restoration.
set constraints all immediate;
do $catalog$ declare observed jsonb;expected jsonb;begin
 select state into strict expected from r2_forward_before;
 with allowed_added as materialized(select value->0 k,value->>1 h from jsonb_array_elements('[[["column","sandbox_commerce_v1.delivery_asset_scans","r2_identity"],"48c2138af4e979bfd57b12a16ba4dbb7fb12f3f6859c4c98717e054886114d20"],[["column","sandbox_commerce_v1.delivery_assets","r2_identity"],"f76cf1f900e725687b20916d890442f517dd5855fe7003647c0ca4093a016534"],[["column","sandbox_commerce_v1.paid_video_uploads","r2_identity"],"e9a4123c39e64555ce4238693850788080c62405a8e2300672b9db671ee55d71"],[["column","sandbox_commerce_v1.r2_bindings","expires_at"],"1d66f9a1bf98cad5a5b3db13b2225e7d55c150135febe366de9c8538c4bd31e9"],[["column","sandbox_commerce_v1.r2_bindings","grant_id"],"c0706291a16dc68569633a0ec9cbf359096791c574746a111647e938e224016b"],[["column","sandbox_commerce_v1.r2_bindings","id"],"ba3c1df9e2a1cea6dd0ac3c210ce3314037238b9597a11b7c21043d26270d85b"],[["column","sandbox_commerce_v1.r2_bindings","issued_at"],"509c9d4013e8fd597b40d8ad198b7a2310b911230151e5bcade35028e5258cb3"],[["column","sandbox_commerce_v1.r2_bindings","operation"],"3df603a3b8631e5835d0dbc211e2cc375de9947adf04b7fe679f14586b7ab1eb"],[["column","sandbox_commerce_v1.r2_bindings","profile_id"],"e840498ec6a3e814594c2c197506f0467408fd987e0a4c147a01c957a20c9639"],[["column","sandbox_commerce_v1.r2_bindings","request_id"],"75d1ea5014ef4907e1896b10d33a43348ec5cbf57ddd6e841e4a090db09d890b"],[["column","sandbox_commerce_v1.r2_bindings","session_id"],"7e9c40b42ee73a45abc56583e93816ac7d3c14a0341f51a6c2f0719475a2f6ec"],[["column","sandbox_commerce_v1.r2_bindings","token"],"bd4d70d1b93a11dcbe0a587447419dfbd4cc93ea0e4fb2d013c4cb4de2c5d7a5"],[["column","sandbox_commerce_v1.r2_bindings","upload_id"],"e011e0123f51ea4529f73e8b3154bb748c89d7f1a07e50932f6eb74758990bf8"],[["column","sandbox_commerce_v1.r2_bindings","user_id"],"11e29b2bc74337be1e1b76fd2820c64ad29ee5bcf6356eb00f68d34d55d00411"],[["column","sandbox_commerce_v1.r2_commits","committed_at"],"fa26f16eae69706b0d123f67886f836874b98ef3fe62d4603b967baee8c9f349"],[["column","sandbox_commerce_v1.r2_commits","identity"],"40260e563ebd22667945fb1d6afd6fee41974498c55314935c26568f150c6d82"],[["column","sandbox_commerce_v1.r2_commits","state"],"157a7c7e176de351196c2232c8dad2b66b0c73b0ffa1c285ca5c94e4f9ef5a16"],[["column","sandbox_commerce_v1.r2_commits","upload_id"],"cb4ee616627b8a80d367f1e9e5c5af89cafb589ab8a94d40ce286515e6548c5f"],[["column","sandbox_commerce_v1.r2_dispatches","binding_id"],"cd2c6295d614d665e8000bc9b4489ed8d63c0c6c68f5f7659351d96f58521a13"],[["column","sandbox_commerce_v1.r2_dispatches","started_at"],"ab16d356dd6e4114e80f2e22db9cf30712b4c006be03bc805e9086114c8d3dcb"],[["column","sandbox_commerce_v1.r2_dispatches","upload_id"],"e1a24a1ff7bd6ad0d67be7c864c804aa3b93ca3b51521f8868e121236f39acfc"],[["column","sandbox_commerce_v1.r2_profiles","capacity_evidence_sha256"],"61f9de912929d16c08be9a3f79e9aa485f875a3d9c0cecd8f29160e176385197"],[["column","sandbox_commerce_v1.r2_profiles","configuration_digest"],"18d014371e7547e39f510a8e0625c705a280b4f8751e346196930d7e885af2ab"],[["column","sandbox_commerce_v1.r2_profiles","enabled"],"72941b3aa9e3d9008c6be667073ffeedb35c8789381f4502477afe6df2cd5774"],[["column","sandbox_commerce_v1.r2_profiles","gateway_key"],"16141dbf686b50120010646a875dc830877719ab7b4a607ed72cfe279d9c4243"],[["column","sandbox_commerce_v1.r2_profiles","id"],"1636ad77c186d08e26f6891162e39dcba1b441e23877633d995e4e18a4fa9bd7"],[["column","sandbox_commerce_v1.r2_profiles","key_id"],"4d5a35e6134d8c20dac6500ec9019952b0b46c029113ca322a3ba5a80024b9c7"],[["column","sandbox_commerce_v1.r2_profiles","qualification_sha256"],"1d9f1381bc8737c22bd704588335117b1d573bdbbaf021ad8589d6d25506ce3d"],[["column","sandbox_commerce_v1.r2_profiles","qualified_max_bytes"],"d36d19864b10c7c197c31206eb786e73bc5658fd39641bd8ecbe10976f9c0174"],[["column","sandbox_commerce_v1.r2_profiles","route_id"],"dae58488fdbe86470586673f23fde4551a83ca16c5add2888f3f5038270b36b5"],[["column","sandbox_commerce_v1.r2_profiles","verifier_id"],"4451d66ccedd147676e83c1325e537015444f9dabeb4ba3d6316ea3bd40a2ae4"],[["column","sandbox_commerce_v1.r2_profiles","worker_id"],"767ffedfb579d999d07cc30e58be8f0dd7aa47d29ebe10ffe93c4473d04f0409"],[["column","sandbox_commerce_v1.r2_receipts","binding_id"],"692796c57efd491724701c36c50ce5a5b3e5ed8d636ffb02b580480be291f4a3"],[["column","sandbox_commerce_v1.r2_receipts","identity"],"f58d458d28e0df981b2ace6d68a5a7656701b3d638f948b44df821499716a775"],[["column","sandbox_commerce_v1.r2_receipts","raw_body"],"cb838c87aa0fc5b582a0a93b01cc4c145042a84198670386656d12e394e091a4"],[["column","sandbox_commerce_v1.r2_receipts","recorded_at"],"b61c9b80c837fcdc157c00e4bd0bfb85d26969386a070a966cfc70bdac40ee48"],[["column","sandbox_commerce_v1.r2_receipts","signature"],"b12071adddbfe5d52b18f89e8cf0f011ef9f7c99ad883af449d5611f1cd432d9"],[["column","sandbox_commerce_v1.r2_receipts","upload_id"],"6413caa0c47675667e2b5810937724be9fcd92ac4a897698e09488b61c6022a5"],[["column","sandbox_commerce_v1.r2_receipts","verifier_id"],"73dad7890f5d873488566042d0f733cc47efa8327dc9e4910bc2b1f2fe50887c"],[["column","sandbox_commerce_v1.r2_tickets","object"],"a0c4348caa29a852dad649cfbeb9691c31fbcec6805ff052fdae5b0692d9a074"],[["column","sandbox_commerce_v1.r2_tickets","profile_id"],"377e75a78cd618802774a1a7c4a8a2a4464f98c9250bdb8142816698ceec1a85"],[["column","sandbox_commerce_v1.r2_tickets","ticket_id"],"13b70cd79dc5eac7a221e9db8480916133fe1de7e6cac09e2a4de92371e1f5fd"],[["columnMetadata","sandbox_commerce_v1.delivery_asset_scans","r2_identity"],"1aa24096be93e94fd145b8a408eed170b43a5c756e3198a9e4faf41cf37c793f"],[["columnMetadata","sandbox_commerce_v1.delivery_assets","r2_identity"],"6d2e2e8b5cd2ac7efdbeda4bfc70e31e7d658f43f5acbf9a149fa50f65a607c9"],[["columnMetadata","sandbox_commerce_v1.paid_video_uploads","r2_identity"],"54089e7afb117a495e5e63c3659783949cbd0619ce3118dafa0f2ec274400b4b"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","expires_at"],"6c1256afe0327c1f6f7f076141564e3d02e5c0ee31b37e56277960e5b2e9624c"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","grant_id"],"466f3e156b21b88f3d9b9065f3a3095be2886d7b48958311d74be8f45db1c44f"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","id"],"8faf6dc41bbf97d24736fb2a15f9d0242f81eaa6beafda321259fb329f81e165"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","issued_at"],"516eb871866af012434885562f800758e9fe53ff8853f2a6a1db32dd279114d7"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","operation"],"7f3aec117ccb9e07bd892dbfb10059e608176b36e964166d00e65f9d59418aa0"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","profile_id"],"e36bb698cff86ef4734214b855c47208f154e9c321cf808d22b05d74546b4b31"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","request_id"],"a7126663fd5fa5e2b08141c27838b33b2d55c30c6789cccb0fa9ccaaa4e32703"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","session_id"],"1fda9b335f12cd62942f5f036c79777210611449a493b127657c34a8f5e3392f"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","token"],"dfae774c919addf0e35cd4c0955da93f0bee843cd42faed40a41e58b3dce50e3"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","upload_id"],"9b39ad614b954bce6b7f99269c31e30f5d32ef912150c39235b81030bcd8a74a"],[["columnMetadata","sandbox_commerce_v1.r2_bindings","user_id"],"2fd76673f0e0b34dbfbd91469da876755cdf309f84910a8716dc5213e50435a7"],[["columnMetadata","sandbox_commerce_v1.r2_commits","committed_at"],"3f1cd89d220f1466f49e64b637f253b283c268410c71f1d7eee354531eba222c"],[["columnMetadata","sandbox_commerce_v1.r2_commits","identity"],"69844a83c3cda9311d7b576ec35965bd23e25e6040b4986957d581ae2f1397bf"],[["columnMetadata","sandbox_commerce_v1.r2_commits","state"],"fe9722a709698bbb4a7093238b97b10d12d8a929de978503468912c35086ed46"],[["columnMetadata","sandbox_commerce_v1.r2_commits","upload_id"],"cc0ba86bf2394dadd1647939db0ccc97d5872919f96b60c9ecfecad2ea7ce472"],[["columnMetadata","sandbox_commerce_v1.r2_dispatches","binding_id"],"0e855d4a3dfce6a533d9cc7f93658481847e210593d665ec59566dd34a676451"],[["columnMetadata","sandbox_commerce_v1.r2_dispatches","started_at"],"c7463ffe2abec18a51448630e38078417e2c5ac91222072dbdeda7e09e1c9340"],[["columnMetadata","sandbox_commerce_v1.r2_dispatches","upload_id"],"7bab9f794433f851a88e2ca83cb906b50ad159ee4b9a97c048838b8776997c39"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","capacity_evidence_sha256"],"df61e3eb2f3512ad9a1305b1b468b150621ebbb92c7ce4740d62d3a9b509a474"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","configuration_digest"],"553daed23351c9d11f9421d329500b99a5955e20a972f1b0ed7a483ec7163490"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","enabled"],"cd71fae61584172bb98a68b23efa286326fbe4a12167ccde5d29b3a8cab0112a"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","gateway_key"],"60e809505c32965ccc1d45f7b3e2474aa395ec80c47f940ee17af930899aaf7d"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","id"],"2c941fd31ab15d74d396b014c26e5eb4b17118a0d4be55245b9551cc8807c7ad"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","key_id"],"2fc3bf96b5ead07f7dc36b276f513333a0fb03dcd72e067890188a0b57de0f67"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","qualification_sha256"],"4ed715714609ad975c85be82ac810a776ac5b9a8f8d71c8c95c405f222a61900"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","qualified_max_bytes"],"309316cd01f9fb395101148be8dc86f12fe70d2544efc2afd3f102a071e88d58"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","route_id"],"4a283f60d1f7dd45d1030c8b949a0759d4bc598d4c9d4f30a3bf494d484cd256"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","verifier_id"],"494c6a6c13a2b07f008ab8041599fb2ac4376170f9b2f1cce8c0d243b2b1fcb6"],[["columnMetadata","sandbox_commerce_v1.r2_profiles","worker_id"],"6a25c9b382340b7cd41b59ce88a1903494cdb4bad90dc329dc8960ce080da589"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","binding_id"],"579b4fd5005c947dcdda72222de553d139b03d1a0aedc1e8ef9a6e00267bbd6f"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","identity"],"b529218f51b3913fe09bb39459e71a6e388c9b82a3cccc4be4731bff30793960"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","raw_body"],"baef5eb10674ad8d68ccffd7279b09b68359deaf2bd8cc13b280a3a3e4f86f30"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","recorded_at"],"60dcb01424cbe013116d6748217703f30d0a60b070b806af09e97bc9a53b64ec"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","signature"],"efcc33983f7a68324680cae0dc85769622b46f445fe73848076ea4346669f6c1"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","upload_id"],"cbdff71588b61b699925cd3cd2de931de855d490502f51b1e907cbecdf17c770"],[["columnMetadata","sandbox_commerce_v1.r2_receipts","verifier_id"],"d5db61dc3971b66a1163905a36841e5f0aebb37bf3824be5e93786c2fff8278f"],[["columnMetadata","sandbox_commerce_v1.r2_tickets","object"],"5a1caaab07608a0af2f561ffbbf9372dddfa91959254e79a2e348ce08ae15658"],[["columnMetadata","sandbox_commerce_v1.r2_tickets","profile_id"],"43410927edaf411588d5905522ab71b26c003605d6498c8cc43ceb43d14ec0a3"],[["columnMetadata","sandbox_commerce_v1.r2_tickets","ticket_id"],"368c4faa1a070ce4b1bade10eab518c84ce889bd4293b0b07afbab50d199b108"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.delivery_asset_scans","typed_object_identity"],"667e1184de1674762920a810e997f88d01f9a5a10b56750e12c367a0cdbbc826"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.delivery_assets","typed_object_identity"],"5cd73bf9110cc6454aaf389d257a19ddaf9dfc14b996c1de19fd80c511485ce4"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.paid_video_uploads","paid_video_uploads_check1"],"c5d98a7aa4a174f72881599aaa89784fecb3857cdf523aef9bd47726fb1438a5"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_check"],"9da2a0a174d58f36c1dfabf6dcd2d512f94f267812638fb06f4d978ac17ec55b"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_operation_check"],"685a6e8c470a48f23f3f0ae4347c96dc9e98c8ffa31cefd4394794df163e00ea"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_pkey"],"6bf36c60f4fff04e179ddd8552783b5a7da47be3371c1b4556450476037baab2"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey"],"1b9b00c53f568cc37ca0b251ea93a109d4197d59310a3334ea5eefd15f76aabe"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey"],"f8456c51e749a45dd2baa28c49ff3510c8c11e1b8e497a166218694ae53f57ee"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_check"],"eaa54a928bc5a8dcfbdae56a2a4d79bd2afbd3196f8f5284157630fa46517f9a"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_pkey"],"0ee0428afb9cf6d96976e0a3a3a14c5c5b12c7446c32670ef079fa833b6850f7"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_state_check"],"41201a6f205d3f7727fc4aadfea3ca99251b0c0276b8361cdece4f150d1c2d61"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey"],"49464a8ab0666ea1117fb71c4e53fcdd659af6fb8df43603dbdc4be0ef704aa5"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey"],"dbdc97663e6c43be24a2d4fb335e83f638def6d4d5053a1f6b124e984a8802ae"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_key"],"812b4e6dfbf8a90514989195984384bc569aea19c1f0e4ba432634217115908e"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_pkey"],"4217a4d45123e5b7d730a88e316dbe0b13fa8da50eb2f561efa99f1365d5ce4f"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey"],"4585d2640b20c0fcea4ce6b1a501945d01bdcad2dafde5d9113319bf7dce9d41"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_capacity_evidence_sha256_check"],"63b70d3d64fbd3fffff279d87c6918788292c55d27fd060a454625de553dd4de"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_configuration_digest_check"],"146ee65c5cb5700071ad7bd487764080cf9aa27283201cb293da3f51c646dda3"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_configuration_digest_key"],"0eae50f00e5d96321c16bd0e839b0eba13dacf11394b0622e1f1c3c7f7f2c12d"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_gateway_key_check"],"82599107427bc764da2833b4d1a2f7d50c2fb7bfe4f09ee37faa4757a241e43f"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_key_id_key"],"2e18343fafbaf408e852cde3a7aa828a9f9b13bc5820151aa28df43dc1cefdd5"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_pkey"],"cc541d67c302934f7182ef5923aeb950592fe1cc8e71bcf20acd40fab835f0fd"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_qualification_sha256_check"],"d82dbba11c63e4fa7857ce852ba4e7098bbcf9c8efd6f3d96cbefbeb06bd642a"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_qualified_max_bytes_check"],"63ff07de1ac4c178f26d895eff7c825075c5d88b6c19d3df89866fed9f87196e"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey"],"fb9fdc76c55e4845d15a8fe958f4bd0b0989283e8765d9c1901424cd50641a26"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_key"],"5a51dbaf6ef15abdce19cb9ec4602e3500cb0df60c447b53d229ad02a2eb5b76"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey"],"c6988a6aacad5accd3b95365db9bc00098bb3abeee8b9b4783c6eb66165a444e"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey"],"74c989c4790d936a62cb298374f8a1f314e9881b44664d3abb40dba64933c445"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey"],"ea4b708a82ad1a1b6f2bd6b1b9e73bd4ff245411680b419f396d965571605b80"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_identity_check"],"a3318b5a89da69d0065c9e4d39d7b4400e2fa46867ac15ad877aec6daf8ae92f"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_pkey"],"b367d083a2864aba9b76a46acad9edc9d35d08348b111299cf8953f969494a83"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_raw_body_check"],"fac26c070fffcaec4364fc8597267715ae67ea9df276ddfbc55ee8c1aa57ceaa"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey"],"7bb09a2ccdb39603b94c89cb573f571ac964efa5fd6e6910076f390ba012d1b3"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey"],"7cba9ea82f7a62843f43798f914a951a1fedf492e78697784d7b9124c12aaa20"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_tickets","r2_tickets_pkey"],"118f14035846dd8533103cd63b401f1a2009192c0029984ef3722878e6df1f21"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey"],"d68672dddb77240173f30ebecdae6d4ed0f05d0ce9108e24ae90d8ea4b05a7ed"],[["constraint","sandbox_commerce_v1","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey"],"ddf7078fbe530f10bb1f3eb655fe0d3809f93fff18344360eb01cf24c4789f81"],[["function","public","native_paid_video_r2_admit_v1","p_action text, p_user_id uuid, p_session_id uuid, p_upload_id uuid, p_request_id uuid, p_configuration_digest text, p_range jsonb, p_grant_id uuid"],"139caf19e831e67222b00349fd855dbbea694c2ec5c89b6c2c8c02ad1d5bb46e"],[["function","public","native_paid_video_r2_gateway_v1","p_token jsonb, p_phase text, p_outcome jsonb"],"1dcfc6bf1d1cf49e443ccbc2ddd7dd156e5ecff17235c55a0c9430e6ed17b332"],[["function","public","native_paid_video_r2_next_v1","p_worker_id uuid"],"f5ef71bea048aa53f3f6e1623b17f519ebd50c4348f29b2ce689eb194d008c15"],[["function","public","native_paid_video_r2_private_state_v1",""],"59f8d0b907a85dbc3e1bc5579f295c6cf9737cfa20331a41ef484dec421824a1"],[["function","public","native_paid_video_r2_reconcile_v1","p_raw_body text, p_signature text, p_user_id uuid, p_session_id uuid"],"d21337b0da2008b0bee4ed908cc217fa4188ba2b1ba14815a4debc1aa69ea321"],[["function","public","native_paid_video_r2_route_v1","p_user_id uuid, p_session_id uuid, p_upload_id uuid, p_configuration_digest text"],"25d7ed96b511dee7dabc04601a9351267fd7c84e162aef0bd83ea1a84d5d9f95"],[["function","public","native_paid_video_r2_scan_admit_v1","p_upload_id uuid, p_ticket_id uuid"],"49a2ac0d5bb173ef6e5545241dbec19b752052213c7f7cf8d67d34f5c41ab4b6"],[["function","public","native_paid_video_r2_worker_v1","p_action text, p_upload_id uuid, p_worker_id uuid, p_raw_body text, p_signature text"],"5b8f7a76a0e066936ceac3df543677d4b1580accdbf098b2fc78d7fea9f540f4"],[["function","sandbox_commerce_v1","native_r2_assert_media","i sandbox_commerce_v1.intents"],"03123be6b89cd1af9add6cffb7fed3836a0bea2398e7f665e8c2314551cd9bd8"],[["function","sandbox_commerce_v1","native_store_paid_video_r2_access","p_user uuid, p_session uuid, p_resource uuid, p_grant uuid"],"0dd9a275579373b3b70f7c1dda09ff404009e0fc3fdf5ba98b3772e329b5655a"],[["function","sandbox_commerce_v1","native_typed_assert_media","i sandbox_commerce_v1.intents"],"82b8136ba3f7b361d0eeeb0190243d3dd85d95961ed7848c7e888bdea3be75a9"],[["function","sandbox_commerce_v1","r2_admit","p_action text, p_user uuid, p_session uuid, p_upload uuid, p_request uuid, p_configuration text, p_range jsonb, p_grant uuid"],"9c54947bd27d6838b9f52b08a30f3d2b4c3b10800a08f3900e46d988823b0aa9"],[["function","sandbox_commerce_v1","r2_assert_scanner","p_profile uuid, p_worker uuid"],"75c6384a919846d4d7d3dd30e8e59598019a1e1bae64a6f164e40837ca0a6c87"],[["function","sandbox_commerce_v1","r2_current","p_token jsonb"],"8058e76efa27e65069254e1457fb12f272015b541eb031c07275822339c5c932"],[["function","sandbox_commerce_v1","r2_gateway","p_token jsonb, p_phase text, p_outcome jsonb"],"273b4d7dc0d31275f894d1802562507fc04e95a8af28059b90276ed64bcc8fcc"],[["function","sandbox_commerce_v1","r2_identity_valid","v jsonb"],"4fff1af8ba7736db59905c3d5d25c998dc79779c4c3cda7ba68f4deb4fad94b4"],[["function","sandbox_commerce_v1","r2_lease","p_upload uuid, p_worker uuid"],"380f19cfc16dc55d23a9f2cbef2c4bd7705ceb200f3297087ccd21f6f4b11274"],[["function","sandbox_commerce_v1","r2_object","p_upload uuid, p_identity boolean"],"e97926640e7d79b8ddd604f781975f740dfe775bd88e6f2b7344553666e99654"],[["function","sandbox_commerce_v1","r2_ready","p_configuration text, p_route uuid"],"4d4f368a4f7ba32a53de75081490786364c1aad34b95eaa47e3f4b44acffab47"],[["function","sandbox_commerce_v1","r2_receipt_json","p_upload uuid"],"c10433417853d6d2cb3af701d1d47655215ccb4efe77236fe0d5d909ec1af3e0"],[["function","sandbox_commerce_v1","r2_reconcile","p_raw text, p_signature text, p_user uuid, p_session uuid"],"c3c4bf3391b90cdd616fb6e37d63894baf554ebfc5d68a3dbf5ddff71a15fad7"],[["function","sandbox_commerce_v1","r2_review_object","p_upload uuid"],"de75d448be7191f7e6f24b0487b61c7ddf534e2b14a4e8aed9757f8f734adf93"],[["function","sandbox_commerce_v1","r2_scan_ingest","p_raw_body text, p_signature text"],"ea5ea638d4e669ef146e310086100a6db09a0b443586291d9e0cc357028af3b7"],[["function","sandbox_commerce_v1","r2_upload_identity_guard",""],"bfb03a62ef8904dec21bf80fef43a33d22a45c020f8985cb44dc32b82ad2fe97"],[["index","sandbox_commerce_v1.delivery_assets","delivery_assets_r2_identity"],"1e7789abc95194a43787402cee45d148344fb2c9a1e1f8d9d41aa138e9a86c58"],[["index","sandbox_commerce_v1.r2_bindings","r2_bindings_pkey"],"935d66b243c2c1cb30b893d3e6ead00dd8f1804b33da49f16236bd5d432b1e7f"],[["index","sandbox_commerce_v1.r2_bindings","r2_one_upload_binding"],"46b7c61841ddc69e85d1d3054195e3b188787575d7cb4ac3fda995dab3aabc3c"],[["index","sandbox_commerce_v1.r2_commits","r2_commits_pkey"],"a4ad00c5e35090f9ddf3011d2f180a46628e4f8522859d270c1479f97ff738c7"],[["index","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_key"],"bc457db9a0e94da43fdce6d8578692eec52370ad0f920b71c4f8c628efc1ca3f"],[["index","sandbox_commerce_v1.r2_dispatches","r2_dispatches_pkey"],"24a6ab70acb35beaa572e3c73f222043a26721ab2beb48ab47f2301c575ac5b2"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_configuration_digest_key"],"a79c38e572e293eb007835abf0393ede23fbb7ba02159c6c10650475cd10bdd1"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_key_id_key"],"3685d453b2c8facef5b7a5aeb6f839a4cfd9c26087655ccff8b2ff3addfb8122"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_pkey"],"61f866446a566e4a4efbfc901983f5bf09ac2b012cc4856584937a5860b596c2"],[["index","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_key"],"918309362c4dd119d1aa47a6a5a3df0a4318614b688a3777320d57eb127c5efb"],[["index","sandbox_commerce_v1.r2_receipts","r2_receipts_pkey"],"deaa7023ede6b11baebc2aa11dbf3ebfa08cb67f5912cefc6db2c7e3115e1ba3"],[["index","sandbox_commerce_v1.r2_tickets","r2_tickets_pkey"],"1334a637de213541152a481297928b8e5baf04d16062f480ef69e7803dc263ae"],[["membership","sbx_v1_r2_gateway","postgres",{"bootstrapSuperuserOid":10}],"e6d04ae7da9a2b3218c782421b494b3984fe4d92887f4dd6ed096c1a2edc83a7"],[["membership","sbx_v1_r2_scanner","postgres",{"bootstrapSuperuserOid":10}],"ff5d16bc44d039a021a44c565552cc162dbacc573b58f68a9ddbb0028a159fc7"],[["policy","sandbox_commerce_v1.r2_bindings","core_owner"],"ccb73c6b76a635d709769f2e18f7ad4e0bfd318a1374cb91d30d93a5dbf4d9b6"],[["policy","sandbox_commerce_v1.r2_commits","core_owner"],"74dd480c8af5f7291a2182299567c9c7d5e46905e31cc467b579babcbf4993e7"],[["policy","sandbox_commerce_v1.r2_dispatches","core_owner"],"5e253e93062a532364135399dbaa6f11869281db6859c512b960440911665466"],[["policy","sandbox_commerce_v1.r2_profiles","core_owner"],"78a025c1d3ff4fba67509e8507b4619da9922a85d4bf549a0a1855de41fdb4e8"],[["policy","sandbox_commerce_v1.r2_receipts","core_owner"],"424b90ef91108e02553198a312a19bada1185ed57fd94dc5d03f67d27c00185b"],[["policy","sandbox_commerce_v1.r2_tickets","core_owner"],"b7c230f2d8670203c8e22c0ac0ad2b511665c5d89c6c5b7b00768e1335603e74"],[["relation","sandbox_commerce_v1","r2_bindings"],"0df72a0a7701a5838678c387ecef9ffe1dc4cd10c4139bd3e397ccd5631cce8b"],[["relation","sandbox_commerce_v1","r2_commits"],"90b2b9d7ee347de470bad3f19aaf3939090f0e72f9319fff6580b531d8b43e8f"],[["relation","sandbox_commerce_v1","r2_dispatches"],"2bf386a93c277580aa6df09af0ac1baa84e504ca16e3ff4e102db95169d0d1d1"],[["relation","sandbox_commerce_v1","r2_profiles"],"b5cdeb53ede00dd5cd4ab0375eb0f3721b94be30bc116cd140962c23569ad963"],[["relation","sandbox_commerce_v1","r2_receipts"],"8d9dc77c4b6b84cab04104a8edd635ae4d31b0c8da60967ad2947ad338fec30f"],[["relation","sandbox_commerce_v1","r2_tickets"],"3c2b10b73b5e907de1cab256b5b73849a28c0eab984bb15a58dbbd6cbc43da50"],[["role","sbx_v1_r2_gateway"],"e12133b26f185b0537311875e5e5deb3f62551721aa99cfd89fd3923fd15bd89"],[["role","sbx_v1_r2_scanner"],"d3a44831c72a4d90e5186003a80813b5acc7891ec14c73999c68af356ab416fb"],[["schemaPrivilege","public","sbx_v1_r2_gateway","USAGE"],"4bd916e127b05b44b658d00e5f1f44fa133cdb96892b790af99c49adc7abe896"],[["schemaPrivilege","public","sbx_v1_r2_scanner","USAGE"],"0a6fc61420c1f52f8a0c9bd1c43af7c9beac9bae6e3c050f866b089357c65c7e"],[["trigger","sandbox_commerce_v1.paid_video_routes","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_noaction_del\"()",9],"e20d191a7be4d85093d3179b39d1bff42dd5c931cda434631f6ce68044325ec7"],[["trigger","sandbox_commerce_v1.paid_video_routes","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_noaction_upd\"()",17],"ce3ca4fd50c11ee604a5dd53529444e155a5b3f08212b239e1574b440ee5335d"],[["trigger","sandbox_commerce_v1.paid_video_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_noaction_del\"()",9],"1c4670713905cea2ad6bda6ef78a2e0d3af31d3717041770d36470b33ddcfd9d"],[["trigger","sandbox_commerce_v1.paid_video_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_noaction_upd\"()",17],"031018547ca59c868a5cc7e88060b88594cd9bd0bc2d9a9ad34eaa074232fddc"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"510197f3773fb9bdb1208566dc7a2766edc5e9b81f64a4cd557f58565081b88a"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"c5fc7efdcae5392b9402a9031bb1a40a6396475125d76f45d2071478822301f9"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"18d3668e38c9514ab448fa09d341a355db7b8b5c7a53fb99b6ea4145e2909ba8"],[["trigger","sandbox_commerce_v1.paid_video_uploads","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"f0195bb0de10a74d1871ffbff08c780a58386649c38427446773a93f9d2bad2e"],[["trigger","sandbox_commerce_v1.paid_video_uploads","typed_identity"],"c2b2872038fd22b6173ce7907be956e17ec3af3e25fa965bb51dede38c12851a"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_noaction_del\"()",9],"95d5e85d4e90d602bcc1d4babf1b3f5552aff8c57b0ec27b3d0a91eb0237f0bc"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_noaction_upd\"()",17],"8e2533ae16f2d95bb0cde1ff9d0cb5d3ebf709397e51c00e397da86a83f96d5d"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_noaction_del\"()",9],"e4f21d8e3c4294d5f6fbc56b337df7acb2e31ae701226fb80614025abcb03d22"],[["trigger","sandbox_commerce_v1.paid_video_verifiers","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_noaction_upd\"()",17],"b2ae9e9d9c49740e755c11bde24f8eccaa126a479bdc1efa43ab35a60de1261c"],[["trigger","sandbox_commerce_v1.paid_video_workers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_noaction_del\"()",9],"93e7e33fe1fc7b9d650ceb14f5c316d945349a79f1f6e4dd11b2250528762ccb"],[["trigger","sandbox_commerce_v1.paid_video_workers","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_noaction_upd\"()",17],"7b444f65f2b09249494b4cbb4c00ff02fcaf52ec908d1961b16da904a753f304"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_check_ins\"()",5],"0c6af1ebb70770806cd4c003935342283afe9a7e0ca659b7ff6f37e6a41c3ee6"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_check_upd\"()",17],"8680d2d8c74658ff65187f732cfcf6f0ae3026977418c423faa75d29a2acfc3d"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"2f65bc2cd8da9c9a5787dcaefe30735253157e068211af9b80ec852c6ecd0088"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"2b7e430c779cc2d4bb60bfe2d8c93d9ccb0b1944a3dce48ced2d89236455e294"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_noaction_del\"()",9],"0969cc4a59892ee1cb7a4d6e3e4da3dc6a941c30b8c5aeecece6a2df83b54649"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_noaction_upd\"()",17],"dedc3fea7e215160409e05f5be1fba32718fd5e4d3cb63fa601bae302f196d06"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_noaction_del\"()",9],"75976b3615e9f7e2a227e7af541dba09506ac4902b9450028c357fe9a2967d73"],[["trigger","sandbox_commerce_v1.r2_bindings","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_noaction_upd\"()",17],"3f98b921d86bd5a75e29e7be80c80ddd55795255050188c104cacc2207987abc"],[["trigger","sandbox_commerce_v1.r2_bindings","immutable"],"e3a78169b34cb42ada072516037442f57a696755b7d39415d3e7e9f7e8e48e49"],[["trigger","sandbox_commerce_v1.r2_bindings","immutable_truncate"],"b20b547ed8bfa4b3bd10cfc388fae6f30beb8050a66112be0858e2c1f5634247"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"71dca46a020963f11a15cba2faa46613f5aea2f80db73eb91b30440a5268e5b5"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"4a4b3f5b1c96ce491216671fecc7857bc1ac4cad48e30bf9785bab63cd46f9b5"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"acfb5a91d1b7c73852142471c7b09d2fa4df1ebee56ffbccb65ff1b32e4cdd69"],[["trigger","sandbox_commerce_v1.r2_commits","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"f6f2fc31c2cf216f87cd9f7dd7c3697755d2a510a2c2f57b95011566219b9826"],[["trigger","sandbox_commerce_v1.r2_commits","immutable"],"8f8a34afc50a71989218db9ab82effb55f418f62d030e8a2c74b1f65e9047b40"],[["trigger","sandbox_commerce_v1.r2_commits","immutable_truncate"],"fbea81dee8a801e87b4cea52ebaa99cccdc56808dfc64887413509538063e71a"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_noaction_del\"()",9],"6164c1060e03daf11f190abd52347872e12bbb0ef91d279e8cbb1fa98ae682c7"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_commits","r2_commits_upload_id_fkey","\"RI_FKey_noaction_upd\"()",17],"de0432789ee7371ba95fad994f7a6de0d4262aefd62a412d479ed819e303f81d"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_check_ins\"()",5],"758f2a730765e2f5549031c29bf34125c0bc1a843d9ba94c3b87471c141ea702"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_binding_id_fkey","\"RI_FKey_check_upd\"()",17],"1473824a49096e7d9871422676a86af8ab9eb6f363e701c4f0b5def0167af3b9"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"f9ee0e83d955c342ec1184b9556dc6f53e5a69324f6cb85332cf55ed371df93c"],[["trigger","sandbox_commerce_v1.r2_dispatches","<internal>","sandbox_commerce_v1.r2_dispatches","r2_dispatches_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"43e203e5d52dc1a2cbc23374e6ecc7ecc93c96de0dfc1cb94479a8911985974d"],[["trigger","sandbox_commerce_v1.r2_dispatches","immutable"],"9c243e8a14c31d6d116653e8fc36df4ecceaabc35b4a91ca07cd3f1de4b49e5f"],[["trigger","sandbox_commerce_v1.r2_dispatches","immutable_truncate"],"0201e3e2cf27e23f4d16279c7fc6a1ffff132559f8d26f547c553fb1ab512ca5"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_noaction_del\"()",9],"1d35859c0bbe2bfb5e1deddea72900f20d484873041ca34c3dac0a820f8a7013"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_bindings","r2_bindings_profile_id_fkey","\"RI_FKey_noaction_upd\"()",17],"e083a59459b8511dbad275ee79e38b01eadb253eefdc8be79f3baf2da7933747"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_check_ins\"()",5],"80d4941a6026de9719b008d0d1cf91e28859d0d07d87fd90f8e35111d7403cec"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_route_id_fkey","\"RI_FKey_check_upd\"()",17],"5f515ce997304ddf0883bf1e72955fa389e7fa6aa21d6aa84ac496f03dd48436"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_check_ins\"()",5],"f23a262d3d3df3a51dc60bda1b86e788baddeb01bf57eac01ed5770f83a8af5b"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_verifier_id_fkey","\"RI_FKey_check_upd\"()",17],"f27bef445d93fddc3c979993a842c3fe900f8901fbe953a8838df9b45048f606"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_check_ins\"()",5],"5cc38c417b8294bc12e82b0c8985d15117309e09caaf6d0584df4410af53283d"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_profiles","r2_profiles_worker_id_fkey","\"RI_FKey_check_upd\"()",17],"01667647c55c7144ca47e6245cfb2295a124d2b4bf50d895413c5200993c597a"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_noaction_del\"()",9],"1d65ed7293b411ef8acf16654288b8c29c55b536332e480e4b08291fdc89b272"],[["trigger","sandbox_commerce_v1.r2_profiles","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_noaction_upd\"()",17],"80df1023374824abce3a900b1b4f5e9f4d8d33f6cc057075fe99ad36e10cad28"],[["trigger","sandbox_commerce_v1.r2_profiles","immutable"],"712fa70e809f00f1bc10378900c107160f8eea998095d3922a35b0082c18d133"],[["trigger","sandbox_commerce_v1.r2_profiles","immutable_truncate"],"9c43f27b5db575d8b34fa1f28e13c60fc6ef83ce8ce0d7fb9f8cd7c42de4df64"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_check_ins\"()",5],"2e28dc6ceb69ab0253629a988900f30fd1aabcb35a7632231ad44dbfc8563cdc"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_binding_id_fkey","\"RI_FKey_check_upd\"()",17],"18ec7005215362868f6cd6d3dee83aa006523654194e120ae5f40b84da360d3b"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_check_ins\"()",5],"139870e7e1c4c9d644a456282eccbeebee51754851a835bdea5e1d868e4e8008"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_upload_id_fkey","\"RI_FKey_check_upd\"()",17],"30f17688ee24f30de1722869e7be0b0cee56bc6d3c077d4d1d9f31ab51bf5ec5"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_check_ins\"()",5],"fc97270c4c3c00e63c6c4520490502c95881a3b446bb7959500950536e673ee9"],[["trigger","sandbox_commerce_v1.r2_receipts","<internal>","sandbox_commerce_v1.r2_receipts","r2_receipts_verifier_id_fkey","\"RI_FKey_check_upd\"()",17],"24cf43303f9832edb3036a54df81bd7166552d4e6b2a87f1465294fca524f984"],[["trigger","sandbox_commerce_v1.r2_receipts","immutable"],"ed3e293e64b3cb60729742f295c99fd3208af00c22f29de31570b7e4cca5af2e"],[["trigger","sandbox_commerce_v1.r2_receipts","immutable_truncate"],"9d0a62f98e9d35a0084887eb383fffdbf0fb56dfbb1beb843ea30cab89f4ffbb"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_check_ins\"()",5],"3b87e3bc229822a34cf891af8c41af5eaf6cb0554a476f3b15e4b9822d72f2c0"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_profile_id_fkey","\"RI_FKey_check_upd\"()",17],"6d3d62c4e9bdc4d4d7e1d100f4c97c4bc99530de304cdd1ce75c4724eab88ea2"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_check_ins\"()",5],"3c3ca45ed3aed45898913bb2afcc1de0e1b2007cbeed7dd1737aea35dc18b44b"],[["trigger","sandbox_commerce_v1.r2_tickets","<internal>","sandbox_commerce_v1.r2_tickets","r2_tickets_ticket_id_fkey","\"RI_FKey_check_upd\"()",17],"f454c2182f3eb019d3805ce93a90f4a70c6d69410642e8f89d3f651e27fe1502"],[["trigger","sandbox_commerce_v1.r2_tickets","immutable"],"7ec048f1df74d9db749ec5bd710f60816d4fd05900d58b322019e1d772e486b4"],[["trigger","sandbox_commerce_v1.r2_tickets","immutable_truncate"],"c767e77a51c591f8a0e66a65c4a89910ac999e9ee967f8d1dab279561a47c60e"],[["type","sandbox_commerce_v1","_r2_bindings"],"417132d5525ce078775dab899e08be49c72ec10246138e7f204d963ca77c7d71"],[["type","sandbox_commerce_v1","_r2_commits"],"6aa2d9617a5a9d2672c589f6a28622490bb20668aa0fe093abdbc250e9283b3b"],[["type","sandbox_commerce_v1","_r2_dispatches"],"0f2b4fe3298ccea0ab2d4fa189bfbaee7323df7156637daa45a7d232125c9499"],[["type","sandbox_commerce_v1","_r2_profiles"],"c502f6008d80983b4ca507f238475e693147b265ba9f00ee9082b1419859ac66"],[["type","sandbox_commerce_v1","_r2_receipts"],"369b6eb6d8309f22980a75fef7edf11b146614ba5123fb719cd83ebae53cfa99"],[["type","sandbox_commerce_v1","_r2_tickets"],"b64d6bde45622dc86fed367f67b6f338f8d792766d9937d74e77c49257acfd9e"],[["type","sandbox_commerce_v1","r2_bindings"],"fab585c25c39e1bdadd1b26c1b0a02ae4b1ef7a31e5fe764be7081734d4c1acd"],[["type","sandbox_commerce_v1","r2_commits"],"386efbd94ed1689a49462f9cdae1e2b35eb821e084bcc2700a11e48891058797"],[["type","sandbox_commerce_v1","r2_dispatches"],"2ed4f8013ac483398d815e1da2b19b50d39005e5b6f54a0ca7d3868296f06bdb"],[["type","sandbox_commerce_v1","r2_profiles"],"983c21831303a9c784335d1f9c6c2f0b96e75f7cf909747ed569fbae2ddd305e"],[["type","sandbox_commerce_v1","r2_receipts"],"8c4c6fbc48c8e08f0e26683b9cda0a10d57e54966bfafac330c6b546d5d455f3"],[["type","sandbox_commerce_v1","r2_tickets"],"f7b5fc221d8c1e15ee150f57b0f2c310241580d50c75cb2d543b407db984f7d3"]]'::jsonb)),
 allowed_changed as materialized(select value->0 k,value->>1 before_h,value->>2 after_h from jsonb_array_elements('[[["column","sandbox_commerce_v1.delivery_asset_scans","object_version"],"4bd946529341db0cd54c5db42d4ca9d0d0f5afb61491ad55a1bcef8bdb63cf0c","a391d9543aa8fc378cb74189fd5a4a6de0ce9c90d93226d9f77e5d1b99b8fe6c"],[["column","sandbox_commerce_v1.delivery_assets","object_version"],"3ecf1eb20dce4a9fe5489ff591cd05367276ed20e5d6229ad0dd8b9f1f57f099","b77a6aa106e2c88956ffabf76220aa7089656150277bec4d1ad7b437e8e70669"],[["function","sandbox_commerce_v1","clean_resource_asset","p_id uuid, p_resource uuid, p_revision bigint, p_owner uuid, p_purpose text"],"ca4b1cee1b53cd4743f3bb8e168ad53cfd776c9c0b10159df314528233e5ff92","97c7de17a26160b92c310e280088a85eba230d396b4ae32551851f123bb4a0ac"],[["function","sandbox_commerce_v1","native_store_apply_effect_pre_play_handoff","p_raw_receipt_id uuid, p_claim_id uuid, p_protocol_id uuid, p_protocol_revision bigint, p_projection jsonb"],"1ab63ed2668ed5b7fac836cf588b0c0fad5f3e23230cffd718cb97b55d84b554","cd8b3c2b1c60eb33197248ecae5a80a52864c58c38a250112c9bdac5a6564126"],[["function","sandbox_commerce_v1","native_store_paid_video_access","p_user uuid, p_session uuid, p_resource uuid, p_grant uuid"],"8b8d609805b6f558fdc3c3c2af208f83f4881e7b8d384d586ee374cb178cd07a","90fb6efc22fcc4ac9a6c4e86f85eb2f4e6d03be5b7a0fe9461452dc13b6b1c7a"],[["function","sandbox_commerce_v1","native_store_play_apply_effect","p_raw_receipt_id uuid, p_claim_id uuid, p_protocol_id uuid, p_protocol_revision bigint, p_projection jsonb"],"749371b325a200b1c28bf9d70ecdd8b6194d010c7d55d3b7f213af47f1d199ce","d8d9990b16b6d9f0037d665c396525ee98fbe7b595019d296cb5a0c8ddf79127"],[["function","sandbox_commerce_v1","native_store_quote_command_armed","p_user uuid, p_session uuid, p_command text, p_request uuid, p_payload jsonb"],"3a000029343ae665e0a384c229e2bb05851f30b93fddfd585887f48b8c20394e","b856353df69508ea4064ff5a5ccf71ffd382b5a5843d3b3547c0a94e002e263e"],[["function","sandbox_commerce_v1","paid_video_command_v2","p_command text, p_payload jsonb, p_user uuid, p_session uuid, p_configuration text"],"de8a90636bf6e18c5f5ff5bc45dcebe2a9b852f4bf5166f43e8821ea32317cf7","9ec8ef7a8a57ab399f9bb779abc3e943b14caa84087a637f16dd5d5e1f3052a2"],[["function","sandbox_commerce_v1","paid_video_gateway_ready","p_configuration text, p_route uuid"],"e1479d9a3eb4e926977a5e0a9909b2747d57f0c8112b6ccdfd200e8cf1d20157","21e78f8b1a0bf2f117bb693dd4be78ee0383aceaf1f234f33f2a625cba8b8672"],[["function","sandbox_commerce_v1","paid_video_native_command","p_command text, p_payload jsonb, p_expected_account_id uuid, p_expected_session_generation uuid"],"be7a41f5a969f65bf9d145d46e23f14f67d15c55124d07ba5ae239c2f07515cc","a74ac3ffa2ea96dfcaabc90caad6d0919e9e240a9783f5df181b1f73da0e96ae"],[["function","sandbox_commerce_v1","paid_video_review","p_action text, p_raw text"],"61ea43b0deb56290a335cca41210d58e27d3244fd24cee069c69a24e593fe340","406152808a07a63fb26e86381c4dcb68d5c5cc3f46ac91a384dff5bb0cf1cef7"],[["function","sandbox_commerce_v1","paid_video_review_snapshot","p_upload uuid"],"ad8a07c054adee1b40336415a0cfaf37fab931d98d3b4559f985eeb5be267ada","532e9f069041514e66d9825fe5123771ea721702dc729740e2835eed8fb9078e"],[["trigger","sandbox_commerce_v1.paid_video_uploads","identity_immutable"],"f2a58a9fb1605530204dd7cd2453aea477db226304dc45c234483b3f20fd8a3d","d44de0c5815890a6fb720d1882a42eeeac55c49e9d5dd02ab3380c0b978c6c90"]]'::jsonb)),
 raw as materialized(
 select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and p.prokind in('f','p')
 union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in('v','m') then pg_get_viewdef(c.oid,true) end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and c.relkind in('r','p','v','m','S')
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')
 union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname,pg_get_constraintdef(co.oid),co.convalidated) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('index',i.indrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text collate "C") from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname,t.tgisinternal,t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid),co.conrelid::regclass::text,co.conname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig) from pg_roles
 union all select jsonb_build_array('membership',m.roleid::regrole::text,m.member::regrole::text,case when m.roleid in(select oid from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=10
 and exists(select 1 from pg_roles where oid=10 and rolsuper)
 and m.admin_option and not m.inherit_option and not m.set_option
 then jsonb_build_object('bootstrapSuperuserOid',10) else to_jsonb(m.grantor::regrole::text) end,m.admin_option,m.inherit_option,m.set_option) from pg_auth_members m
 union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype,defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('eventTrigger',e.evtname,e.evtevent,e.evtenabled,e.evttags,e.evtowner::regrole::text,pg_get_functiondef(e.evtfoid),p.proacl::text,p.proowner::regrole::text) from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
 union all select jsonb_build_array('type',n.nspname,t.typname,t.typtype,t.typcategory,t.typowner::regrole::text,t.typnotnull,t.typdefault,case when t.typrelid=0 then null else t.typrelid::regclass::text end,case when t.typelem=0 then null else format_type(t.typelem,null) end,case when t.typbasetype=0 then null else format_type(t.typbasetype,t.typtypmod) end,case when t.typcollation=0 then null else t.typcollation::regcollation::text end,t.typacl::text) item from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('columnMetadata',a.attrelid::regclass::text,a.attname,a.attnum,case when a.attcollation=0 then null else a.attcollation::regcollation::text end,a.attstorage,a.attcompression,a.attoptions,a.attfdwoptions) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and c.relkind in('r','p','v','m','S') and a.attnum>0 and not a.attisdropped
 union all select jsonb_build_array('sequence',s.seqrelid::regclass::text,format_type(s.seqtypid,null),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle) from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('enum',n.nspname,t.typname,e.enumsortorder,e.enumlabel) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') union all select jsonb_build_array('schemaPrivilege','public',g.rolname,'USAGE',false,'<schema-owner>')
 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 join pg_roles g on g.oid=a.grantee where n.nspname='public' and g.rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner')
 and a.grantor=n.nspowner and a.privilege_type='USAGE' and not a.is_grantable limit 60001),
 acls as materialized(select distinct k,v from (
 select 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1','public') and p.prokind in('f','p')
 union all select 'relation:'||n.nspname||'.'||c.relname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1') and c.relkind in('r','p','v','m','S')
 union all select 'schema:'||n.nspname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) from pg_namespace n where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1')
 union all select 'column:'||a.attrelid::regclass::text||'.'||a.attname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type,a.is_grantable),'[]'::jsonb) from aclexplode(a.attacl) a) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1') and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')
  union all select 'schema:'||n.nspname k,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type collate "C",a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) v from pg_namespace n where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select 'type:'||n.nspname||'.'||t.typname,(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor) collate "C",case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end collate "C",a.privilege_type collate "C",a.is_grantable),'[]'::jsonb) from aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) a) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')) a),
 acl_keyed as materialized(select item r,case item->>0
 when 'function' then 'function:'||(item->>1)||'.'||(item->>2)||'('||(item->>3)||')'
 when 'relation' then 'relation:'||(item->>1)||'.'||(item->>2)
 when 'column' then 'column:'||(item->>1)||'.'||(item->>2)
 when 'schema' then 'schema:'||(item->>1)
 when 'type' then 'type:'||(item->>1)||'.'||(item->>2) end acl_k,
 case item->>0 when 'schema' then 3 when 'type' then 12 else 5 end acl_i from raw),
 acl_normalized as materialized(select case when a.v is null then r else jsonb_set(r,array[acl_i::text],a.v) end r from acl_keyed left join acls a on a.k=acl_k),
 normalized as materialized(select case when r->>0='schema' and r->>1='public' then
 jsonb_set(r,'{3}',(select coalesce(jsonb_agg(v order by ord),'[]'::jsonb) from jsonb_array_elements(r->3) with ordinality a(v,ord)
  where not(v->>0=r->>2 and v->>1 in('sbx_v1_r2_gateway','sbx_v1_r2_scanner') and v->>2='USAGE' and v->3='false'::jsonb)))
 when r->>0='trigger' and r->3='true'::jsonb then
 jsonb_set(jsonb_set(r,'{2}','"<internal>"'),'{9}',to_jsonb(regexp_replace(r->>9,'RI_ConstraintTrigger_[ac]_[0-9]+','RI_ConstraintTrigger_<internal>','g'))) else r end r from acl_normalized),
 measured as materialized(select r,encode(sha256(convert_to(r::text,'UTF8')),'hex') h,case r->>0
 when 'function' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'schemaPrivilege' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'constraint' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'membership' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'defaultAcl' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'index' then jsonb_build_array(r->0,r->1,substring(r->>2 from '^CREATE (?:UNIQUE )?INDEX (.+?) ON '))
 when 'trigger' then case when r->3='true'::jsonb then jsonb_build_array(r->0,r->1,r->2,r->10,r->11,r->4,r->5) else jsonb_build_array(r->0,r->1,r->2) end
 when 'enum' then jsonb_build_array(r->0,r->1,r->2,r->4)
 when 'column' then jsonb_build_array(r->0,r->1,r->2)
 when 'columnMetadata' then jsonb_build_array(r->0,r->1,r->2)
 when 'policy' then jsonb_build_array(r->0,r->1,r->2)
 when 'type' then jsonb_build_array(r->0,r->1,r->2)
 when 'relation' then jsonb_build_array(r->0,r->1,r->2)
 else jsonb_build_array(r->0,r->1) end k from normalized),oids as materialized(select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) k,p.oid::text v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and p.prokind in('f','p')
 union all select case when c.relkind in('i','I') then jsonb_build_array('index',i.indrelid::regclass::text,c.relname) else jsonb_build_array('relation',n.nspname,c.relname) end,c.oid::text from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_index i on i.indexrelid=c.oid where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname),co.oid::text from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select case when t.tgisinternal then jsonb_build_array('trigger',t.tgrelid::regclass::text,'<internal>',co.conrelid::regclass::text,co.conname,t.tgfoid::regprocedure::text,t.tgtype) else jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname) end,t.oid::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('type',n.nspname,t.typname),t.oid::text from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname),p.oid::text from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('schema',n.nspname),n.oid::text from pg_namespace n where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')
 union all select jsonb_build_array('role',r.rolname),r.oid::text from pg_roles r
 union all select jsonb_build_array('membership',m.roleid::regrole::text,m.member::regrole::text,case when m.roleid in(select oid from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 and m.member=(select oid from pg_roles where rolname='postgres') and m.grantor=10
 and exists(select 1 from pg_roles where oid=10 and rolsuper)
 and m.admin_option and not m.inherit_option and not m.set_option
 then jsonb_build_object('bootstrapSuperuserOid',10) else to_jsonb(m.grantor::regrole::text) end),m.oid::text from pg_auth_members m
 union all select jsonb_build_array('eventTrigger',evtname),oid::text from pg_event_trigger
 union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype),d.oid::text from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname),d.oid::text from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') limit 35001),history as materialized(select version,name,created_by,idempotency_key,statements,rollback,case when cardinality(statements) between 1 and 1024 and array_ndims(statements)=1 and array_lower(statements,1)=1 then (select coalesce(bool_and(s is not null and octet_length(s)<=8388608),false) and coalesce(sum(octet_length(s)),0)<=16777216 from unnest(statements) s) else false end statement_safe,case when rollback is null then true when cardinality(rollback) between 0 and 256 and (cardinality(rollback)=0 or array_ndims(rollback)=1) then (select coalesce(bool_and(s is not null and octet_length(s)<=8388608),true) and coalesce(sum(octet_length(s)),0)<=16777216 from unnest(rollback) s) else false end rollback_safe,octet_length(version)<=64 and (name is null or octet_length(name)<=4096) and(created_by is null or octet_length(created_by)<=4096) and(idempotency_key is null or octet_length(idempotency_key)<=4096) metadata_safe from (select version,name,created_by,idempotency_key,statements,rollback from supabase_migrations.schema_migrations order by version collate "C" limit 2501) bounded_history)
 select jsonb_build_object(
 'protocol','r2-forward-observation-v1','source','39378202a8e677dd3c01eb71a96ab9ceb5525de3','tree','f39edb815fa4ffeb53eff32ba85f67415fb074db','extensionDigest','55ed69aab2b2e3991fbf37542e82985141e85bdbc15028487054fc325847c4de',
 'context',jsonb_build_object('currentUser',current_user,'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'serverVersionNum',current_setting('server_version_num')),
 'capturedAt',clock_timestamp(),'snapshot',pg_current_snapshot()::text,'database',current_database(),'serverStartedAt',pg_postmaster_start_time(),
 'roleSafety',(select count(*)=1 and bool_and(not rolsuper) from pg_roles where rolname='postgres')
 and (select count(*)=2 and bool_and(not rolsuper and not rolcanlogin and not rolcreaterole and not rolcreatedb and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner'))
 and (select count(*)=1 and bool_and(not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication) from pg_roles where rolname='supabase_read_only_user'),
 'historyBoundarySafe',(select count(*)=1 and bool_and(c.relowner='postgres'::regrole and c.relkind='r' and c.relpersistence='p' and not c.relrowsecurity and not c.relforcerowsecurity) from pg_class c where c.oid='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_trigger where tgrelid='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_rewrite where ev_class='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_attrdef where adrelid='supabase_migrations.schema_migrations'::regclass)
 and (select count(*)=6 and bool_and(not attisdropped and attidentity='' and attgenerated='' and case when attname in('statements','rollback') then atttypid='text[]'::regtype when attname in('version','name','created_by','idempotency_key') then atttypid='text'::regtype else false end) from pg_attribute where attrelid='supabase_migrations.schema_migrations'::regclass and attnum>0)
 and (select count(*)=2 and bool_and(convalidated) and count(*) filter(where pg_get_constraintdef(oid)='PRIMARY KEY (version)')=1 and count(*) filter(where pg_get_constraintdef(oid)='UNIQUE (idempotency_key)')=1 from pg_constraint where conrelid='supabase_migrations.schema_migrations'::regclass),
 'withinBounds',(select count(*)<=60000 from raw) and (select count(*)<=35000 from oids) and (select count(*)<2501 and coalesce(bool_and(statement_safe and rollback_safe and metadata_safe),false) from history) and (select count(*)<2501 and coalesce(sum(cardinality(statements)),0)<=20000 from history) and (select count(*)<25001 from(select 1 from public.platform_money_kill_switches limit 25001) bounded_money),
 'catalogCount',(select count(*) from measured),'catalogSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select r from measured limit 60001) h(item)),
 'retainedCount',(select count(*) from measured m where not exists(select 1 from allowed_added a where a.k=m.k) and not exists(select 1 from allowed_changed c where c.k=m.k)),
 'retainedSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select r from measured m where not exists(select 1 from allowed_added a where a.k=m.k) and not exists(select 1 from allowed_changed c where c.k=m.k) limit 60001) h(item)),
 'retainedOidSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select jsonb_build_array(o.k,o.v) from oids o where not exists(select 1 from jsonb_array_elements('[["trigger","sandbox_commerce_v1.paid_video_uploads","identity_immutable"]]'::jsonb) x where x.value=o.k) and not exists(select 1 from allowed_added a where a.k=o.k) limit 35001) h(item)),
 'allOidSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select jsonb_build_array(k,v) from oids limit 35001) h(item)),
 'duplicateKeys',(select count(*) from(select k from measured group by k having count(*)<>1) d),
 'ambiguousACLs',(select count(*) from(select k from acls group by k having count(*)<>1) a),
 'addedPresent',(select count(*) from measured m join allowed_added a using(k)),
 'beforeChangedExact',(select count(*)=13 and count(m.h)=13 and bool_and(m.h=c.before_h) from allowed_changed c left join measured m using(k)),
 'afterChangedExact',(select count(*)=13 and count(m.h)=13 and bool_and(m.h=c.after_h) from allowed_changed c left join measured m using(k)),
 'addedExact',(select count(*)=252 and count(m.h)=252 and bool_and(m.h=a.h) from allowed_added a left join measured m using(k)),
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'historySha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select case when metadata_safe then jsonb_build_array(version,name,jsonb_build_array(created_by,idempotency_key,array_ndims(rollback),array_lower(rollback,1),cardinality(rollback),case when rollback_safe and rollback is not null then encode(sha256(convert_to(array_to_json(rollback)::text,'UTF8')),'hex') else null end),array_ndims(statements),array_lower(statements,1),cardinality(statements),case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') else null end) else null end from history limit 25001) h(item)),
 'predecessorReceiptsExact',(select count(*)=2 and bool_and(name=case version when '20261110021153' then 'revenuecat_native_legacy_exclusion_v1' else 'native_store_play_handoff_settlement_v1' end and cardinality(statements)=1 and array_ndims(statements)=1 and array_lower(statements,1)=1 and case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')=case version when '20261110021153' then 'db5be54c1757ea8a487d446715f344b11a486497b67c5198d511ed240167499b' else '34e9e2dc1569ea4ba1e0f4f746869071f959a24540a22d6e91130207e49ea771' end else false end) from history where version in('20261110021153','20261110021650')) and (select count(*)=1 and bool_and(name='native_paid_video_authoring_operations_v1' and cardinality(statements)=1 and array_ndims(statements)=1 and array_lower(statements,1)=1 and case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')='af9e35e0ce2bfd0b2e644f34d46cfb805ab662c898faabcd7505e1ec0e50ba85' else false end) from history where version='20261110060000'),
 'baseReceiptExact',(select count(*)=1 and bool_and(name='native_store_sandbox_source_bound_48' and array_ndims(statements)=1 and array_lower(statements,1)=1 and cardinality(statements)=1 and case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')='d5a54d9ea772952f72d3ccc53449a788d4a0dec51aafc116b4a1af0c71f01ff9' else false end) from history where version='20261109151349'),
 'historyReceipts',(select coalesce(jsonb_agg(case when metadata_safe then jsonb_build_object('version',version,'name',name,'metadataSha256',case when rollback_safe then encode(sha256(convert_to(jsonb_build_array(created_by,idempotency_key,array_ndims(rollback),array_lower(rollback,1),cardinality(rollback),case when rollback_safe and rollback is not null then encode(sha256(convert_to(array_to_json(rollback)::text,'UTF8')),'hex') else null end)::text,'UTF8')),'hex') else null end,'extraMetadataNull',created_by is null and idempotency_key is null and rollback is null,'statementsCount',cardinality(statements),'arrayDimensions',array_ndims(statements),'arrayLower',array_lower(statements,1),'statementArraySha256',case when statement_safe then encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') else null end,'statementHashes',case when statement_safe then (select coalesce(jsonb_agg(encode(sha256(convert_to(s,'UTF8')),'hex') order by ord),'[]'::jsonb) from unnest(statements) with ordinality u(s,ord)) else null end) else null end order by version collate "C"),'[]'::jsonb) from history where (select count(*)<2501 and coalesce(sum(cardinality(statements)),0)<=20000 from history)),
 'moneyControlsSha256',(select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(item::text,'UTF8')),'hex'),'' order by item::text collate "C"),''),'UTF8')),'hex') from (select jsonb_build_array(key,state) from public.platform_money_kill_switches limit 25001) h(item)),
 'moneyHeld',(select count(*)=9 and bool_and(state=case when key in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end) from public.platform_money_kill_switches where key in('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled')),
 'ownerPrivilegesRestored',not has_schema_privilege('sbx_v1_core_owner','public','CREATE') and not has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') and not exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)),
 'currentPrivateRuntimeState','UNQUALIFIED','retryAllowed',false,'deploymentAllowed',false,'activationAllowed',false) state into observed;

 if not (observed->>'historyBoundarySafe')::boolean or not (observed->>'withinBounds')::boolean or not (observed->>'addedExact')::boolean or not (observed->>'afterChangedExact')::boolean
 or (observed->>'addedPresent')::int<>252
 or (observed->>'catalogCount')::int<>(expected->>'catalogCount')::int+252
 or (observed->>'duplicateKeys')::int<>0 or (observed->>'ambiguousACLs')::int<>0
 or not (observed->>'ownerPrivilegesRestored')::boolean or not (observed->>'moneyHeld')::boolean
 or observed->'database' is distinct from expected->'database'
 or observed->'serverStartedAt' is distinct from expected->'serverStartedAt'
 or observed->'retainedCount' is distinct from expected->'retainedCount'
 or observed->'retainedSha256' is distinct from expected->'retainedSha256'
 or observed->'retainedOidSha256' is distinct from expected->'retainedOidSha256'
 or observed->'moneyControlsSha256' is distinct from expected->'moneyControlsSha256'
 then raise exception 'r2_exact_catalog_mismatch';end if;
 if observed->'historyCount' is distinct from expected->'historyCount'
 or observed->'historyMaximum' is distinct from expected->'historyMaximum'
 or observed->'historySha256' is distinct from expected->'historySha256' then raise exception 'r2_history_changed_before_receipt';end if;
end $catalog$;
