import { test, expect } from "@playwright/test";

test("create, autosave, reload, search and delete a persistent note", async ({
  page,
}, info) => {
  const title = `Browser note ${info.project.name} ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: /New note/ }).click();
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Note body" })
    .fill("A persistent thought.\nSecond line.");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toHaveText("● Saved");
  await page.reload();
  await page.getByRole("textbox", { name: "Search notes" }).fill(title);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("textbox", { name: "Note body" })).toHaveValue(
    "A persistent thought.\nSecond line.",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: `test-results/${info.project.name}-editor.png`,
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    title,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete note" }).click();
  await page.getByRole("textbox", { name: "Search notes" }).fill(title);
  await expect(page.getByText("No matching notes.")).toBeVisible();
});


test("long notes remain scrollable and persist after reload", async ({ page }, info) => {
  const title = `Long note ${info.project.name} ${Date.now()}`;
  const body = "A long line of plain text for scrolling.\n".repeat(1500);
  await page.goto("/");
  await page.getByRole("button", { name: /New note/ }).click();
  await page.getByRole("textbox", { name: "Note title" }).fill(title);
  const editor = page.getByRole("textbox", { name: "Note body" });
  await editor.fill(body);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toHaveText("● Saved");
  expect(await editor.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.reload();
  await page.getByRole("textbox", { name: "Search notes" }).fill(title);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("textbox", { name: "Note body" })).toHaveValue(body);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.getByRole("textbox", { name: "Search notes" })).toBeVisible();
});
