// Deliberately narrow SDR export policy, not generic HDR/Dolby Vision support.
// Original source bytes are never changed. Unknown signaling is not guessed.
export function clipRenderColorPlan(stream) {
  const sideData = stream?.side_data_list ?? [];
  if (['dvhe', 'dvh1', 'dvav', 'dva1', 'dav1'].includes(stream?.codec_tag_string) ||
      sideData.some(data => /dovi|dolby vision/i.test(data.side_data_type ?? ''))) {
    throw new Error('hdr_dolby_vision_unqualified');
  }
  const transfer = stream?.color_transfer;
  if (!['smpte2084', 'arib-std-b67'].includes(transfer)) {
    if (sideData.some(data => /mastering display|content light|dynamic hdr|hdr dynamic|hdr10/i.test(data.side_data_type ?? ''))) {
      throw new Error('hdr_color_metadata_unqualified');
    }
    return null;
  }
  if (stream.color_primaries !== 'bt2020' || stream.color_space !== 'bt2020nc' ||
      !['tv', 'pc'].includes(stream.color_range)) throw new Error('hdr_color_metadata_unqualified');
  // Fixed, reproducible policy: 100-nit reference white, PQ's 10,000-nit
  // representable peak, or HLG's 1,000-nit reference display. Mobius preserves
  // the linear toe below 0.3 and compresses highlights; it is not lossless and
  // values outside the reference envelope can clip. Do not trust arbitrary
  // mastering metadata to silently change this curve from frame to frame.
  const peak = transfer === 'smpte2084' ? 100 : 10;
  const range = stream.color_range === 'tv' ? 'limited' : 'full';
  return {
    policy: 'bt2020-pq-hlg-to-bt709-mobius-v1',
    filter: `zscale=pin=bt2020:min=bt2020nc:tin=${transfer}:rin=${range}:t=linear:npl=100:agamma=0,` +
      // tonemap uses the frame's matrix tag for luminance coefficients even on
      // RGB pixels. Supply BT709 coefficients, then explicitly restore the RGB
      // input-matrix interpretation for the final zscale conversion.
      `format=gbrpf32le,zscale=p=bt709,setparams=colorspace=bt709,tonemap=tonemap=mobius:param=0.3:desat=2:peak=${peak},` +
      'zscale=min=gbr:t=bt709:m=bt709:r=limited:agamma=0,format=yuv420p,sidedata=mode=delete',
  };
}

export async function requireClipHdrCapabilities(ffmpeg, options, run) {
  const listing = await run(ffmpeg, ['-hide_banner', '-filters'], { ...options, timeoutMs: 60_000, maxOutputBytes: 512_000 });
  for (const name of ['zscale', 'tonemap', 'sidedata', 'setparams']) {
    if (!new RegExp(`^\\s*[.A-Z|]{3}\\s+${name}\\s+`, 'm').test(listing)) throw new Error('hdr_conversion_unavailable');
  }
}

export function isClipSdrOutput(video) {
  return video?.pix_fmt === 'yuv420p' && video.color_primaries === 'bt709' &&
    video.color_transfer === 'bt709' && video.color_space === 'bt709' && video.color_range === 'tv';
}
