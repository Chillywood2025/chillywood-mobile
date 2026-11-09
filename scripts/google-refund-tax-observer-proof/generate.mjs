// OFFLINE ONLY. No connector, deployment or target execution authority.
import {createHash} from 'node:crypto';
import {sql} from './staged.mjs';
import {verifyInputs} from './verify-inputs.mjs';
if(process.argv.length!==3||process.argv[2]!=='--offline')throw Error('OFFLINE_FLAG_REQUIRED_NO_TARGET_EXECUTION_AUTHORIZED');
const lock=verifyInputs();
if(createHash('sha256').update(sql).digest('hex')!==lock.stagedQualifierSha256)throw Error('STAGED_PROOF_QUERY_DRIFT');
process.stderr.write(JSON.stringify({offlineOnly:true,databaseBaselineQualified:false,targetExecutionAuthorized:false,targetMemoryHeadroomAccepted:false,edgeQualified:false,deploymentQualified:false,sha256:lock.stagedQualifierSha256})+'\n');
process.stdout.write(sql);
