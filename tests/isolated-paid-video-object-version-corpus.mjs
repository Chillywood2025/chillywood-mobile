// Shared by server, app transport and durable-recovery contract tests.
// This filename is included by the canonical PaidVideo source manifest.
export const acceptedObjectVersions = ['opaque/+==%2F%25&?#', ' version with spaces ', 'NULL', 'x'.repeat(1024), 'é'.repeat(512), '€'.repeat(341) + 'x', '😀'.repeat(256), 'e\u0301'];
export const rejectedObjectVersions = ['', 'null', null, 123, {}, 'x'.repeat(1025), 'é'.repeat(513), '€'.repeat(342), '€'.repeat(341) + 'é', '😀'.repeat(257), '\ud800', '\udfff', 'x\ud800y', ...Array.from({length:32},(_,i)=>'a'+String.fromCharCode(i)+'b'), 'a\x7fb'];
export const objectVersionCorpus = [...acceptedObjectVersions.map(value=>[value,true]), ...rejectedObjectVersions.map(value=>[value,false])];
