import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const app=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
const css=fs.readFileSync(path.join(root,"src/app/globals.css"),"utf8");

test("signed-in sidebar exposes direct Account Security access",()=>{
  assert.match(app,/className="accountSecurityShortcut"/);
  assert.match(app,/Change password or email a reset link/);
  assert.match(app,/function openAccountSecurity\(\)/);
  assert.match(app,/pendingSettingsFocusRef\.current="account-security"/);
  assert.match(app,/setView\("settings"\)/);
});

test("Settings exposes a focusable Account Security anchor",()=>{
  assert.match(app,/id="account-security" tabIndex=\{-1\}/);
  assert.match(app,/target\.scrollIntoView/);
  assert.match(app,/target\.focus/);
});

test("account security shortcut is styled for signed-in navigation",()=>{
  assert.match(css,/\/\* Signed-in account security shortcut \*\//);
  assert.match(css,/\.accountSecurityShortcut\{/);
  assert.match(css,/\.accountSecurityAnchor\{scroll-margin-top:18px\}/);
});
