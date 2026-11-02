#!/usr/bin/env node
// Do not add static imports: --help and the default OFF path must not load an
// adapter, credential, database driver or provider SDK, let alone contact one.
const args=process.argv.slice(2);
const usage='Usage: node scripts/clip-export-control-plane-cli.mjs --once|--loop [--execute]\nDefault OFF. Enabled mode is read-only dry-run unless a separate execution gate and approved adapters are provided.';
async function main(){
 if(args.length===1&&args[0]==='--help'){console.log(usage);return;}
 if(process.env.CLIP_EXPORT_CONTROL_PLANE_ENABLED!=='true'){
  console.log(JSON.stringify({enabled:false,mode:'disabled',ticks:0}));return;
 }
 if(args.filter(value=>['--once','--loop'].includes(value)).length!==1||args.some(value=>!['--once','--loop','--execute'].includes(value))
  ||new Set(args).size!==args.length)throw Error('clip_control_arguments_invalid');
 const execute=args.includes('--execute');
 if(execute&&process.env.CLIP_EXPORT_CONTROL_PLANE_EXECUTION_ENABLED!=='true')throw Error('clip_control_execution_gate_required');
 const {pathToFileURL}=await import('node:url');
 const adapterPath=value=>{if(!value||!value.startsWith('/')||value.includes('\0'))throw Error('clip_control_adapter_path_required');return pathToFileURL(value).href;};
 const telemetryUrl=adapterPath(process.env.CLIP_EXPORT_TELEMETRY_ADAPTER);
 // Merely having a provider path configured does not import it in dry-run.
 const providerUrl=execute?adapterPath(process.env.CLIP_EXPORT_PROVIDER_ADAPTER):null;
 const telemetryModule=await import(telemetryUrl);
 if(typeof telemetryModule.createClipExportTelemetryAdapter!=='function')throw Error('clip_control_telemetry_factory_required');
 const adapter=await telemetryModule.createClipExportTelemetryAdapter();
 const {runClipExportControlPlane}=await import('./lib/clip-export-control-plane.mjs');
 const stop=new AbortController();process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort());
 const result=await runClipExportControlPlane({enabled:true,executionEnabled:execute,once:args.includes('--once'),adapter,signal:stop.signal,
  executorFactory:execute?async options=>{const module=await import(providerUrl);
   if(typeof module.createClipExportScaleExecutor!=='function')throw Error('clip_control_provider_factory_required');return module.createClipExportScaleExecutor(options);}:undefined,
  onSummary:value=>console.log(JSON.stringify(value))});
 if(result.last?.reason?.startsWith('clip_control_'))process.exitCode=1;
}
main().catch(()=>{console.error(JSON.stringify({ok:false,reason:'clip_control_plane_unavailable',secretsPrinted:false}));process.exitCode=1;});
