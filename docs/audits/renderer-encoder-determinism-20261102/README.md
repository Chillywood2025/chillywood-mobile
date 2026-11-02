# Exact-frame validation separated from lossy encoder nondeterminism

These are fresh local FFmpeg7.1.5 controls, not recovered historical evidence or hosted6.1.1 execution. All tiny media operations ran under the shared heavy-test lock. The initial matrix failure media was cleaned by the old finally; fresh controlled reproducer media is retained separately.

Twenty early-fractional renders (ten baseline/current pairs) used one byte-identical source and one unique encode argv after excluding output filename. A baseline and a candidate independently produced alternate decoded hash9e09fe30…0083 versus usualcc1b88a5…b825. Difference:11310bytes,max31,frames45–59,first2212900. Each MP4 decoded stably with one or two decoder threads. Frame PTS/types/dimensions were identical.

Ten pre-encode raw extractions were byte-identical:5902b72609cf36f48d730203b9b88e166583c1e6c531344a2da8790a081c0926,2916000bytes (60frames). Ten encodes of that ONE raw file with libx264/presetfast/CRF22/threads2, no seek/filter/audio, reproduced those exact two decoded hashes (9normal,1alternate). This isolates lossy encoder nondeterminism, not altered input selection/timing. It does not identify the internal libx264 race or qualify every worker build.

Six-per-stage single-thread controls were stable in their small sample; this does NOT prove single-thread production settings are a necessary/sufficient fix. Production source remains unchanged.

Validation correction: unchanged actual baseline/current rendering and integrity decode; capture its encode argv transparently with exec; replay only output codec/container changes to rawvideo/NUT; exact frame equality before lossy encoding. Actual exports still compare dimensions, count, timing, complete decode and aligned audio (existing2PCM-unit bound, no offset). Wrong-trim and rotation negative controls must fail exact pre-lossy comparison. Frozen baseline/hash unchanged. No decoded pixel tolerance introduced.

The archive includes fresh source, normal baseline, alternate baseline/current and exact pre-encode raw input. Its SHA256 is69cfcbe317dfb623e73f34ee9fca004e3499b2aa95592b24f65f974ce5a6d041. JSON/JSONL files contain actual commands, output hashes and mismatch counts; scripts retain original local import paths.
