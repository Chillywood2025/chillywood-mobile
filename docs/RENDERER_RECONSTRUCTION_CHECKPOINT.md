# Renderer reconstruction checkpoint

Owner authorized reconstruction of missing pieces on November2 at14:23UTC. This initial checkpoint restores retained source bytes only; it is not a complete implementation or a validated release. Missing tests, worker resource module/CLI integration, UI follow-ups, HDR-safe error propagation, policy inventory and workload tooling remain under reconstruction. Prior historical test reports are not fresh qualification.

Paid scaling, purchases, provider/security changes, deployment, builds and OTA remain held. Each completed checkpoint must be remotely persisted and read back.

Restored source SHA-256 manifest:

[
  {
    "path": "scripts/clip-export-control-plane-cli.mjs",
    "sha256": "c96f7717d64f52a82c57a92fa7bdbf0276426e145b727561ba4be0535a59dcb1"
  },
  {
    "path": "tests/clip-export-control-plane.test.mjs",
    "sha256": "d2186d7a93dd2d5fef0d5b0e7b3676582b42bc1b6fc91073ffeb01245474c5d5"
  },
  {
    "path": "scripts/lib/clip-export-control-plane.mjs",
    "sha256": "54da359c23a8655eed64ac0845fb43ab56bc6b7f7fbe0735470fe14a5295bb7f"
  },
  {
    "path": "tests/fixtures/clip-render-output-seek-baseline.mjs",
    "sha256": "f7f1b2fa705f0aa518c58ff4ff18d80dd54917dc3e05c345431ac26d864cde67"
  },
  {
    "path": "scripts/lib/clip-export-pool.mjs",
    "sha256": "eabe51fab1ef24dbe8a57eac0de8e6b19213233de4c98edf424bd112abaefc4b"
  },
  {
    "path": "scripts/test-clip-export-pool-concurrency-postgres.mjs",
    "sha256": "f9ab4016a9fbbef05ea5587e49bc62fec05db1c565463e004736882f4f25f670"
  },
  {
    "path": "scripts/lib/clip-export-worker.mjs",
    "sha256": "61575ee1977d73bb9058dd217cb37cfdecbae78e55df1586ffb48563a8de62ab"
  },
  {
    "path": "scripts/lib/clip-export-transport.mjs",
    "sha256": "de89a0046e59609751662346022f9f7ca5fbf965fe0525e62e1262be823f2bf3"
  },
  {
    "path": "scripts/lib/clip-export-scale-ledger.mjs",
    "sha256": "37e83b7109505a2c01fc481b70ff4536d0dfd45c6565999331902c900931ac3a"
  },
  {
    "path": "scripts/lib/clip-export-scale-plan.mjs",
    "sha256": "476f916f134d5f46b7c61d311b02de2dbccb31908e7822dd9c02429c125751ca"
  },
  {
    "path": "tests/helpers/clip-export-health-fixture.mjs",
    "sha256": "a3262c1e8f21e934e458d1d22b5a47cd3df224a970db7fb4635a238da79a2526"
  },
  {
    "path": "scripts/lib/clip-export-health.mjs",
    "sha256": "6219936e98e434790900f6f060849ef9abce7d884b3ec46d5641bd0ba8b76e5c"
  },
  {
    "path": "scripts/lib/clip-export-scale-controller.mjs",
    "sha256": "d8230060273b23f94fc3c10bf0acb6e5326f22875ed44b53220758eefbd58f53"
  },
  {
    "path": "supabase/migrations/20261102094308_creator_clip_scale_lifecycle_ledger.sql",
    "sha256": "23cdf5b71b4d84d9403df53011521dcd994d8da2916d40061b71ae45fdaf122e"
  },
  {
    "path": "supabase/migrations/20261102093836_creator_clip_export_bounded_pool.sql",
    "sha256": "21c1ffd1c1e2e8799ca9d45f62e0a7ac54b56334693369ba8369d21db8acc3f0"
  },
  {
    "path": "ops/clip-export-worker/chillywood-clip-export-pool.service",
    "sha256": "a35f9559bce41d02848ebce1bdbfd9b0ffa2e3433a091dea6755f67b321250cf"
  },
  {
    "path": "tests/clip-export-pool-database.test.mjs",
    "sha256": "5d8c0b948e6113d8c6d4b0e373e2905e8c27d876edcd5f79fcc9849b53886cca"
  },
  {
    "path": "tests/clip-export-health.test.mjs",
    "sha256": "2e13ad4b0ff75a4fc18bec4cbe422e867f0bc929d8b9c555f8b2bceaa5484ed4"
  },
  {
    "path": "tests/helpers/clip-export-pool-native-ledger.mjs",
    "sha256": "8bac8236c757320289646a7308a790ab9561b5b400a736e2abb10748badfb6c2"
  },
  {
    "path": "tests/helpers/clip-export-pool-fixture.mjs",
    "sha256": "b6edf0ac385f7af4d3d32eb665c5d4f3d037f8e1a31fc863028404b71fca3d63"
  },
  {
    "path": "tests/helpers/clip-export-health-fixture.mjs",
    "sha256": "a3262c1e8f21e934e458d1d22b5a47cd3df224a970db7fb4635a238da79a2526"
  },
  {
    "path": "tests/clip-export-pool-native-runner-source.test.mjs",
    "sha256": "42739b0dff196ffd56ca2a41e3e94b19141d1948cb1d47ea0fa22b0506f5f1a5"
  },
  {
    "path": "scripts/lib/clip-render-core.mjs",
    "sha256": "0e511876f25ca8f2e57ebe9be7d519ac31c42842615107dafb5d72458cedd71e"
  },
  {
    "path": "scripts/lib/clip-render-color.mjs",
    "sha256": "7bb1e70df1f4aada77518d9188a30eb69d815d917f6bee7d0ef78c316b5db85b"
  },
  {
    "path": "tests/clip-render-color.test.mjs",
    "sha256": "cd6ace98b9ac2b91e6fad8a0c017b830a22741d51cda6f106ff399b94beb96f7"
  },
  {
    "path": "docs/CLIP_RENDER_COLOR_POLICY.md",
    "sha256": "48d2f644b2bb71f6a699caacda2c2a2abc348603da87b5ec52599fee5ed6ad2a"
  }
]
