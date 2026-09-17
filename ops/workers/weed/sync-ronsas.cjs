const fs = require("fs");
const path = require("path");
const git = require("isomorphic-git");
const http = require("isomorphic-git/http/node");
const home = process.env.USERPROFILE;
const root = path.join(home, "Resonance", "RONSAS");
const authority = JSON.parse(
  fs.readFileSync(path.join(root, "node", "authority.json"), "utf8").replace(/^\uFEFF/, ""),
);
const actor = { name: "RONSAS Worker", email: "ronsas-worker@localhost" };
(async () => {
  const hub = path.join(root, "github", "resonance-hub");
  await git.pull({
    fs,
    http,
    dir: hub,
    url: authority.sourceAuthority.hub.repo + ".git",
    ref: authority.sourceAuthority.hub.branch,
    singleBranch: false,
    fastForwardOnly: true,
    author: actor,
    committer: actor,
  });
  const hubHead = await git.resolveRef({ fs, dir: hub, ref: "HEAD" });
  const control = path.join(root, "github", "control-worker");
  const controlHead = await git.resolveRef({ fs, dir: control, ref: "HEAD" });
  if (controlHead !== authority.sourceAuthority.control.head)
    throw new Error(`control pin mismatch: ${controlHead}`);
  console.log(JSON.stringify({ hubHead, controlHead, controlMode: "dropbox-bundle-pinned" }));
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
