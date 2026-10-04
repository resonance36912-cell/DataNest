import { expect, test } from "@playwright/test";

const appPath = process.env.DATANEST_APP_PATH || "/";

test("legacy explicit full-motion preference migrates without following reduced system motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("datanest.motionPaused", "false"));

  await page.goto(appPath);

  const motion = page.getByLabel("Motion preference", { exact: true });
  await expect(motion).toHaveValue("full");
  await expect(page.locator("html")).toHaveAttribute("data-motion-paused", "false");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("datanest.motionPreference"))).toBe("full");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("datanest.motionPaused"))).toBe(null);

  await page.reload();
  await expect(page.getByLabel("Motion preference", { exact: true })).toHaveValue("full");
  await expect(page.locator("html")).toHaveAttribute("data-motion-paused", "false");
});
