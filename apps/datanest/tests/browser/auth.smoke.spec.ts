import { expect, test } from "@playwright/test";

const appPath = process.env.DATANEST_APP_PATH || "/";

test("renders the signed-out application without uncaught browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(appPath);
  await expect(page.getByRole("heading", { name: "DataNest" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("shows a recoverable configuration error", async ({ page }) => {
  await page.route("**/runtime-config.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.__DATANEST_CONFIG__={supabaseUrl:'',supabasePublishableKey:'',authoritative:true};"
    });
  });

  await page.goto(appPath);
  await expect(page.getByText("Public Supabase runtime configuration is missing.")).toBeVisible();
});

test("failed authentication clears the busy state and reports an error", async ({ page }) => {
  await page.route("**/auth/v1/**", async (route) => {
    await route.abort("failed");
  });

  await page.goto(appPath);
  await page.getByLabel("Email").fill("smoke-test@example.invalid");
  await page.locator('input[type="password"][autocomplete="current-password"]').fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".authMessage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("keeps the sign-in interface usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appPath);
  await expect(page.getByRole("heading", { name: "DataNest" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});


test("offline sign-in failure remains recoverable", async ({ page, context }) => {
  await page.goto(appPath);
  await expect(page.getByLabel("Email")).toBeVisible();

  await context.setOffline(true);
  await page.getByLabel("Email").fill("offline-test@example.invalid");
  await page.locator('input[type="password"][autocomplete="current-password"]').fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".authMessage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await context.setOffline(false);
});

test("expired stored session returns to a recoverable auth state", async ({ page }) => {
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid_grant", error_description: "Refresh Token Not Found" })
    });
  });

  await page.addInitScript(() => {
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const accessToken = [
      encode({ alg: "HS256", typ: "JWT" }),
      encode({ sub: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", exp: 1 }),
      "expired"
    ].join(".");

    localStorage.setItem(
      "sb-sgqdmfgjbprsoqsmgigi-auth-token",
      JSON.stringify({
        access_token: accessToken,
        refresh_token: "expired-refresh-token",
        token_type: "bearer",
        expires_in: 0,
        expires_at: 1,
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "expired@example.invalid"
        }
      })
    );
  });

  await page.goto(appPath);
  await expect(
    page.getByRole("heading", { name: /DataNest|Connection problem/ })
  ).toBeVisible();
  await expect(page.locator(".authShell")).toBeVisible();
});


test("theme defaults to Sovereign Dark and persists explicit light selection", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });

  await page.goto(appPath);

  const root = page.locator("html");
  const themeControl = page.getByRole("main").getByRole("combobox", { name: "Theme preference" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(themeControl).toHaveValue("dark");

  await themeControl.selectOption("light");
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(themeControl).toHaveValue("light");
});

test("invalid stored theme normalizes to system and follows system color scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("datanest-theme", "ultraviolet"));

  await page.goto(appPath);

  const root = page.locator("html");
  const themeControl = page.getByRole("main").getByRole("combobox", { name: "Theme preference" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(themeControl).toHaveValue("system");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("datanest-theme"))).toBe("system");
});

test("theme layer honors reduced effects and high contrast without hiding sign-in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(appPath);

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("main").getByRole("combobox", { name: "Theme preference" })).toBeVisible();

  const tokens = await page.locator("html").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      motionFast: style.getPropertyValue("--motion-duration-fast").trim(),
      focusWidth: style.getPropertyValue("--focus-ring-width").trim()
    };
  });
  expect(tokens.motionFast).toBe("0.01ms");
  expect(Number.parseFloat(tokens.focusWidth)).toBeGreaterThanOrEqual(3);
});


test("public surface exposes canonical operator and governance identity", async ({ page }) => {
  await page.goto(appPath);

  await expect(page.getByText("Resonance DataNest", { exact: true }).first()).toBeVisible();
  const trustMark = page.getByRole("link", { name: "RSGP Governed" });
  await expect(trustMark).toBeVisible();
  await expect(trustMark).toHaveAttribute("data-trust-kind", "governance");
  await expect(trustMark).toHaveAttribute("href", /\/governance\/?$/);

  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Resonance Sole Proprietorship");
  await expect(footer).toContainText("Resonance App Development");
  await expect(footer).toContainText("Resonance DataNest");
  await expect(footer).toContainText("free promotion");
  for(const [label,href] of [
    ["Legal Centre","/legal"],
    ["Governance","/governance"],
    ["Privacy","/privacy"],
    ["Terms","/terms"],
    ["Disclaimers","/disclaimers"]
  ] as const){
    await expect(footer.getByRole("link",{name:label,exact:true})).toHaveAttribute("href",new RegExp(href+"\\/?$"));
  }

  await expect(trustMark).not.toContainText(/certif|accredit/i);
  await expect(page.getByRole("link", { name: /buy|subscribe|checkout/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /buy|subscribe|checkout/i })).toHaveCount(0);
});
