import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const port = "4317";
const server = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "start", "--port", port], {
  env: { ...process.env, PORT: port },
  stdio: "ignore",
});

try {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
    } catch {
      // The local production server may still be starting; retry briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response?.ok) throw new Error("Could not render the GitHub Pages entry page.");
  let html = await response.text();
  html = html
    .replaceAll('"/_next/', '"/UK2/_next/')
    .replaceAll('"/favicon.svg', '"/UK2/favicon.svg')
    .replaceAll('href="#', 'href="/UK2/#');
  await writeFile("dist/client/index.html", html);
  await writeFile("dist/client/404.html", html);
  await writeFile("dist/client/.nojekyll", "");
} finally {
  server.kill("SIGTERM");
}
