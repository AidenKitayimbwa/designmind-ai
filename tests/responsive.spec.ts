import { expect, test, type Page } from "@playwright/test";

const TABS = ["Overview", "Visual", "UX critique", "Accessibility", "Market", "Comparison", "Similar apps"];

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, "page should not scroll horizontally").toBeLessThanOrEqual(innerWidth);
}

test("home page: upload zone, key choice and Continue work", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find what to fix in your design, in about a minute" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who reviews your design" })).toBeVisible();

  // Upload zone and Choose files
  const zone = page.getByTestId("upload-zone");
  await expect(zone).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose files" }).click();
  await (await chooser).setFiles("public/examples/screen-a.jpg");
  await expect(page.getByAltText("Screen A thumbnail")).toBeVisible();

  // Key choice: Outskill key is the default, BYOK shows the key field
  const outskill = page.getByRole("radio", { name: /Outskill key/ });
  await expect(outskill).toBeChecked();
  await page.getByRole("radio", { name: /Bring your own key/ }).check();
  await expect(page.getByLabel("OpenRouter API key")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await outskill.check();

  // Continue is enabled once an image is added (trial click: don't start a real review)
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeVisible();
  await expect(cont).toBeEnabled();
  await cont.click({ trial: true });

  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `tests/screenshots/home-${info.project.name}.png`, fullPage: true });
});

test("example review: every tab opens and pins appear", async ({ page }, info) => {
  await page.goto("/examples/example-compare");
  await expect(page.getByText("This is an example review.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start your own" })).toHaveAttribute("href", "/");

  const pins = page.getByTestId("pin");
  expect(await pins.count()).toBeGreaterThan(0);
  await expect(pins.first()).toBeVisible();
  await pins.first().click();
  await expect(page.getByText(/^Fix 1 \(P[012]\):/)).toBeVisible();

  const mobile = info.project.name === "mobile";
  for (const tab of TABS) {
    if (mobile) await page.getByTestId("tab-select").selectOption(tab);
    else await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByTestId(`panel-${tab}`)).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  if (mobile) await page.getByTestId("tab-select").selectOption("Overview");
  else await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `tests/screenshots/example-${info.project.name}.png`, fullPage: true });
});

test("a review from another browser shows the not-saved message", async ({ page }) => {
  await page.goto("/review/rev-notinthisbrows");
  await expect(page.getByText(/This review isn.t saved in this browser/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a new review" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
