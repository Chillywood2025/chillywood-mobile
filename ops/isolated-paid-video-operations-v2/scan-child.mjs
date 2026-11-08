import { executeScanTicket } from '../isolated-paid-video-worker/job.mjs';
import { createPrivateS3Transport } from '../isolated-paid-video-worker/private-object.mjs';
import { Buffer } from 'node:buffer';
const terminateGroup = () => { try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); } };
process.once('disconnect', terminateGroup);
process.once('message', async ({ ticket, configuration, deadline }) => {
  const remaining = Math.min(deadline, Date.parse(ticket.expiresAt) - 5000) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 600000) return terminateGroup();
  const timer = setTimeout(terminateGroup, remaining);
  try {
    const transport = createPrivateS3Transport(configuration.s3);
    const pinned = { async readForScan(binding, deadline) {
      const result = await transport.readForScan({ ...binding, objectVersion: ticket.objectVersion }, deadline);
      if (result.objectVersion !== ticket.objectVersion) throw new Error('paid_video_object_version_changed');
      return result;
    } };
    const result = await executeScanTicket({ ticket, workerKey: Buffer.from(configuration.workerKeyHex, 'hex'),
      transport: pinned, workDirectory: configuration.workDirectory, scanner: configuration.scanner });
    process.send({ ok: true, result });
  } catch { process.send({ ok: false }); }
  finally { clearTimeout(timer); }
});
