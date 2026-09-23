import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const port = 3000;

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  // Serve only the page and compiled browser modules.
  const file = pathname === "/" ? "index.html"
    : /^\/dist\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.js$/.test(pathname)
      ? pathname.slice(1) : null;
  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const content = await readFile(new URL(file, root));
    response.writeHead(200, {
      "Content-Type": file.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    }).end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Open http://localhost:${port} to view Deadware.`);
});
