// Carry the producer's exact output generation into every proof/token request.
// Reconstructing from a batch label loses the immutable producer directory.
export function premiumHlsProofPaths(outputPrefix,rendition){
 if(typeof outputPrefix!=='string'||!outputPrefix.endsWith('/')||!outputPrefix.startsWith('playback/protected/premium/')
  ||outputPrefix.includes('..')||!/^[A-Za-z0-9_/-]+\/$/.test(outputPrefix)
  ||!['720p','1080p'].includes(rendition?.label)||!Array.isArray(rendition.segments)
  ||!rendition.segments[0]||!/^[A-Za-z0-9_.-]+$/.test(rendition.segments[0]))throw Error('premium_hls_proof_identity_invalid');
 const prefix=outputPrefix+rendition.label+'/';
 return{masterPath:prefix+'master.m3u8',variantPath:prefix+'index.m3u8',segmentPath:prefix+rendition.segments[0],wrongPath:prefix+'wrong.m3u8'};
}
