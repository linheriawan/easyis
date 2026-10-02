import { Router } from './router.js';
import { checkIntegrity } from './modules.js';
import { checkConnection } from './database.js';
import * as configs from '@etc/routes.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[95m';
const BLUE = '\x1b[34m';
const RED = '\x1b[31m';
console.log(`${BOLD}${BLUE}Prepare App Init..${RESET}`)

const dbOk = await checkConnection();
console.log(`${GREEN}db connection:${RESET} ${dbOk ? '\x1b[32mok\x1b[0m' : `${RED}unreachable${RESET} (MYSQL_CONN in .env — continuing without it)`}`);

console.log(`${GREEN}Begin module integrity check:${RESET}\n`);
await checkIntegrity();

// static dirs are declared per-config in routes.js — '..' is rejected
// outright so a request can never resolve outside the declared directory.
async function serveStatic(dir, pathname) {
  if (!dir || pathname.includes('..')) return null;
  const file = Bun.file(new URL(`../${dir}${pathname}`, import.meta.url));
  return (await file.exists()) ? new Response(file) : null;
}

// one Bun.serve() per exported config in routes.js — add a new server by
// exporting a new { serve, type, ep, pre?, static? } object there, nothing
// here needs to change.
console.log(`\n`)
for (const config of Object.values(configs)) {
  const route = new Router([config.ep], config.pre, config.config_flow);

  Bun.serve({
    port: config.serve,
    async fetch(req) {
      const { pathname } = new URL(req.url);

      const staticResp = await serveStatic(config.static, pathname);
      if (staticResp) return staticResp;

      const pending = route.handle(req);
      const response = config.type === 'html' ? await pending.html() : await pending.json();

      return response ?? new Response('Not Found', {
        status: 404,
        headers: { 'access-control-allow-origin': '*' },
      });
    },
  });

  console.log(`🧘🏻‍♀️ ${BLUE}${config.name}${RESET} listening on http://${GREEN}localhost${RESET}:${BOLD}${config.serve}${RESET}`);
}
