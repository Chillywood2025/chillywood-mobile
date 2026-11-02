// Synthetic observations only; never a worker qualification or provider probe.
export function syntheticClipHealthEvidence(now,{workerIds=['worker-fixture'],activeJobs=1}={}){
 return {observedAtMs:now,inventory:{observedAtMs:now,workerIds},
  workers:workerIds.map(workerId=>({workerId,sessionId:`session-${workerId}`,observedAtMs:now,lastHeartbeatAtMs:now-1000,
   capacity:1,activeJobs,oldestJobStartedAtMs:activeJobs?now-60000:null,lastProgressAtMs:activeJobs?now-10000:null,tempAvailableBytes:50*1024**3,
   workerCgroup:{observedAtMs:now,available:true,scope:'current-process-cgroup-v2-including-descendants',isolationVerified:false,
    memoryCurrentBytes:1024**3,memoryLimitBytes:4*1024**3,oomEvents:{oomKill:0},cpuUsageUsec:5000000}})),
  outcomes:[],dependencies:['database','source_storage','output_storage'].map(dependency=>({dependency,observedAtMs:now,operation:'read_only_probe',outcome:'ok'}))};
}
