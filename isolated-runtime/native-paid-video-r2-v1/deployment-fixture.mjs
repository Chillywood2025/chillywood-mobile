// Disposable loopback-only predecessor, including actual shared/Play/Studio.
import {authoringDeploymentFixture} from '../native-paid-video-authoring-v1/deployment-fixture.mjs';
import {snapshotReadSQL,validateObservation} from '../native-paid-video-authoring-v1/deployment.mjs';
import {buildLocalFixtureDeploymentEnvelope} from '../native-paid-video-authoring-v1/deployment-envelope.mjs';
export async function r2DeploymentFixture(options){
 const f=await authoringDeploymentFixture(options);
 try{
  const baseline=JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user'));validateObservation(baseline,{before:true});
  const packet=buildLocalFixtureDeploymentEnvelope({baseline,fixtureToken:f.fixtureToken});
  f.q(packet.sql,'postgres');
  return f;
 }catch(error){f.stop();throw error;}
}
