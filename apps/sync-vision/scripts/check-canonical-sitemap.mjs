import { read, assert, ok } from "./_check-utils.mjs";
const xml = read("public/sitemap.xml");
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
assert(urls.length > 0, "sitemap contains no URLs");
assert(urls.every(u => u.startsWith("https://www.reson8.life/")), "sitemap contains a non-reson8.life canonical URL");
assert(urls.includes("https://www.reson8.life/apps/sync-vision"), "Sync Vision canonical URL missing from sitemap");
ok(urls.length+" sitemap URL(s) use the Hub canonical");
