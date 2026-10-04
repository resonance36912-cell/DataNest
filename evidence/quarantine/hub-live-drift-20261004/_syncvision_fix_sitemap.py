import os
import pathlib
import subprocess

r = pathlib.Path(r"C:\Users\Ashley\Documents\GitHub\resonance-hub")
p = r / "src" / "routes" / "sitemap[.]xml.ts"
data = subprocess.check_output(["git", "show", "upstream/main:src/routes/sitemap[.]xml.ts"], cwd=r)
old = b'          { loc: `${BASE_URL}/sync-vision/pricing`, changefreq: "monthly", priority: "0.8", lastmod: today },\\n'
new = old + b'          { loc: `${BASE_URL}/apps/sync_vision`, changefreq: "weekly", priority: "0.8", lastmod: today },\\n'
assert data.count(old) == 1, "Expected one sitemap anchor"
p.write_bytes(data.replace(old, new))
print("SITEMAP_REBUILT_FROM_UPSTREAM_MAIN_WITH_ONE_SYNCVISION_ENTRY")
os.remove(__file__)
