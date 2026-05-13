import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(scriptDir, "site");

const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT) || 4177;

function resolveRequestPath(requestUrl = "/") {
  const url = new URL(requestUrl, `http://127.0.0.1:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);

  if (decodedPath.includes("..")) return null;
  if (decodedPath === "/") return path.join(siteRoot, "index.html");

  const directPath = path.join(siteRoot, decodedPath);
  if (path.extname(directPath)) return directPath;
  return path.join(directPath, "index.html");
}

function contentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((request, response) => {
  const target = resolveRequestPath(request.url);

  if (!target) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("bad request");
    return;
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": contentType(target) });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`public legal site serving http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
