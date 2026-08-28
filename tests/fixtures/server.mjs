import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const fixturePath = fileURLToPath(new URL("./chatgpt-composer.html", import.meta.url));

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname !== "/" && pathname !== "/chatgpt-composer.html") {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    const fixture = await stat(fixturePath);
    response.writeHead(200, {
      "content-length": fixture.size,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    createReadStream(fixturePath).pipe(response);
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : "Fixture error");
  }
});

server.listen(4173, "127.0.0.1");

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
