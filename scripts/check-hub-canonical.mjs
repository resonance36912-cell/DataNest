import { read, assert, ok } from "./_check-utils.mjs";
const html = read("index.html");
const expected = 'rel="canonical" href="https://www.reson8.life/apps/sync-vision"';
assert(html.includes(expected), "Sync Vision Hub canonical is missing or changed");
assert(!/resonanceonline\.life/i.test(html), "legacy resonanceonline.life canonical/reference remains in index.html");
ok("Hub canonical is correct");
