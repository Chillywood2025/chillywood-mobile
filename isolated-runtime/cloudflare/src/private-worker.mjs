import { WorkerEntrypoint } from "cloudflare:workers";
import { createPrivateInvocationHandler } from "./private-core.mjs";

export const createPrivateWorkerEntrypoint = ({
  createDatabase,
  principal,
  resolveAdapter,
}) =>
  class CognitivePrivatePrincipal extends WorkerEntrypoint {
    async fetch() {
      return new Response(
        JSON.stringify({ error: "private_service_binding_only" }),
        {
          headers: { "content-type": "application/json" },
          status: 404,
        },
      );
    }

    async invoke(envelope, invocationToken) {
      return createPrivateInvocationHandler({
        createDatabase,
        env: this.env,
        principal,
        resolveAdapter,
      })(envelope, invocationToken);
    }
  };
