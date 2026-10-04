import { read, assert, ok } from "./_check-utils.mjs";
const robots = read("public/robots.txt");
assert(/User-agent:\s*\*/i.test(robots), "robots.txt lacks wildcard user-agent");
assert(robots.includes("Sitemap: https://www.reson8.life/sitemap.xml"), "robots.txt lacks canonical Hub sitemap");
const sitemap = read("public/sitemap.xml");
assert(sitemap.includes("<urlset"), "public/sitemap.xml is not a urlset");
ok("robots and sitemap are internally consistent");
