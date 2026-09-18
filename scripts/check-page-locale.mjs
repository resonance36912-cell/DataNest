import { read, assert, ok } from "./_check-utils.mjs";
const html = read("index.html");
const m = html.match(/<html\s+[^>]*lang=["']([^"']+)["']/i);
assert(m, "html lang attribute missing");
assert(/^en(?:-|$)/i.test(m[1]), "unexpected page locale: "+m[1]);
ok("page locale is "+m[1]);
