import { read, assert, ok } from "./_check-utils.mjs";
const html = read("index.html");
for (const marker of [
  "<title>",
  'name="description"',
  'rel="canonical"',
  'property="og:title"',
  'property="og:description"',
  'name="twitter:title"',
]) assert(html.includes(marker), "missing "+marker);
assert(!/[\uFFFD\u0080-\u009F]/u.test(html), "index.html contains invalid replacement/control characters");
ok("HTML metadata present and UTF-8 clean");
