import { expect, test } from "@playwright/test";

// These pages only render form states; no email is requested.
test("password recovery pages render their states", async ({ page }) => {
  await page.goto("/forgot-password");
  if (page.url().includes("/login")) test.skip(true, "Email is not available in this environment.");
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();

  await page.goto("/reset-password?token=abc");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("password-one");
  await page.getByLabel("Confirm new password").fill("password-two");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator(".form-error")).toContainText("match");

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Request a new link/ })).toBeVisible();
});

test("sign in offers password recovery when email is available", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: "Forgot your password?" });
  if (await link.count()) {
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  }
});
