# Clip export color policy: SDR derivatives, untouched originals

The owner approved standard SDR exports for broad playback compatibility while
retaining original HDR uploads unchanged. This implements a narrow, tested
conversion; it does **not** establish generic HDR/iPhone/Dolby Vision support or
authorize renderer activation. Both production gates remain off.

## Implemented input boundary

- Explicit PQ (`smpte2084`) or HLG (`arib-std-b67`) transfer, BT2020 primaries,
  BT2020 nonconstant-luminance matrix, and known limited/full range are converted.
- Dolby Vision codec tags/configuration side data return
  `hdr_dolby_vision_unqualified`. This includes profile8: a potentially compatible
  base layer is not evidence that ignoring its RPU/dynamic rendering is correct.
- Known HDR transfer with ambiguous/unsupported color metadata, or HDR mastering
  metadata without a qualified transfer, returns `hdr_color_metadata_unqualified`.
  Missing metadata is never invented. Ten-bit depth alone does not establish HDR.
- Existing SDR processing and qualified seek selection remain unchanged.
- The installed FFmpeg must list `zscale`, `tonemap`, `setparams`, and `sidedata`.
  Missing capability returns `hdr_conversion_unavailable` before render output
  creation. This source change installs nothing. Presence checks do not replace
  qualification of the actual deployed binary/build and its dependencies.

Worker-safe errors preserve these distinctions for the failure RPC and creator
status. Qualification failures are not permission to loop automatic retries or
change the original upload. Unsupported color must remain an explicit failed
export, not a successfully generated artifact with guessed colors.

## Deterministic conversion

1. Spatial framing stays at ten-bit YUV precision; full-resolution float RGB
   buffers are avoided by performing bounded crop/scale before tone mapping.
2. `zscale` linearizes with 100-nit reference white, then converts to float RGB
   and BT709 gamut. HLG uses the 1000-nit reference display/system gamma1.2.
3. Mobius tone mapping uses knee0.3 and highlight-desaturation threshold2. Its
   fixed reference peak is100 for PQ (10000nits), or10 for HLG (1000nits).
   This reproducible policy deliberately does not let arbitrary mastering
   metadata change the curve between frames. It is lossy: highlight appearance
   changes, out-of-gamut colors can be clipped, and values beyond the selected
   reference envelope may clip. No claim of perfect highlight preservation.
4. The float RGB matrix tag supplies BT709 luminance coefficients to `tonemap`.
   The final `zscale` explicitly interprets its input as RGB; this prevents
   confusing RGB components with YUV or inflating neutral-highlight luminance.
5. Output is display-referred BT709/BT1886 (gamma2.4), limited-range eight-bit
   `yuv420p` H.264. Obsolete HDR frame side data is removed. The output's primaries,
   transfer, matrix, range and pixel format are verified, in addition to the
   existing dimensions/duration/size/codec and complete `-xerror` decode.
6. Ordinary SDR watermark pixels are composited **after** tone mapping. Source
   bytes are never overwritten; a derivative remains a separate private draft.

## Evidence, and what it does not prove

`node --test tests/clip-render-color.test.mjs tests/clip-render-core.test.mjs tests/clip-render-seek.test.mjs`

Color fixtures are four actual one-second 288x162 HEVC Main10 inputs: PQ/HLG,
each with limited/full range. Each contains nine neutral luminance patches and
three in-gamut chromatic patches constructed independently in JavaScript.
Expected decoded SDR values come from transfer/primary-matrix/Mobius reference
math, not a second invocation of the production filter. Tolerance is four luma
code values for neutral patches and five YUV code values for chromatic patches,
including quantization and lossy output encoding. Gray watermark pixels over a
black source prove the mark is not treated as HDR. Tests also check original
byte preservation, output SDR metadata, obsolete first-frame HDR metadata,
capability failure before output creation, missing metadata, and Dolby Vision
classification. These are synthetic real-media tests, not a real phone capture
or a clinical/display-calibrated color assessment.

Remaining production blockers: genuine iPhone PQ/HLG/Dolby Vision samples and
profile inventory; reviewed reference/playback on actual iOS/Android/browser
devices; bright/saturated/highlight and temporal color quality; the actual
worker's FFmpeg/zimg build; long-source and maximum-envelope resource usage;
and shared Hetzner CPU/RAM/disk qualification. The tiny color fixtures prove
neither sustained workload capacity nor that this shared host can run HDR jobs.

## Primary implementation references

- [FFmpeg zscale and tonemap filters](https://ffmpeg.org/ffmpeg-filters.html):
  linear-light float tone mapping, nominal peak, Mobius and output conversion.
- [FFmpeg Mobius implementation](https://github.com/FFmpeg/FFmpeg/blob/n7.1/libavfilter/vf_tonemap.c):
  piecewise curve and luminance-coefficient handling for desaturation.
- [zimg transfer functions](https://github.com/sekrit-twc/zimg/blob/master/src/zimg/colorspace/gamma.cpp)
  and [HLG color operations](https://github.com/sekrit-twc/zimg/blob/master/src/zimg/colorspace/operation_impl.cpp):
  display-referred BT709 uses BT1886 rather than the camera OETF; HLG's colored
  OOTF uses luminance, not independent per-channel powers.
