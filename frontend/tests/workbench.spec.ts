import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("用户名", { exact: true }).fill("demo");
  await page
    .getByLabel("密码", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "Local-demo-workbench-91");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "任务安排工作台." }),
  ).toBeVisible();
  await expect(page.locator(".stat-card").first()).toContainText("全部任务");
  await expect(page.locator(".error-banner")).toHaveCount(0);
}
async function navigate(page: Page, label: string) {
  const menu = page.getByRole("button", { name: "打开导航", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
}

test("任务创建、筛选、编辑、删除与恢复", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.screenshot({
    path: info.outputPath("dashboard.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const title = `流程验证-${info.project.name}-${Date.now()}`;
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill(title);
  await dialog
    .getByLabel("负责人", { exact: true })
    .selectOption({ label: "小林" });
  await dialog
    .getByLabel("所属项目", { exact: true })
    .selectOption({ label: "官网焕新计划" });
  await dialog.getByLabel("下一步操作", { exact: true }).fill("确认下一步安排");
  await dialog.getByLabel("备注", { exact: true }).fill("浏览器端到端测试");
  await dialog.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, "任务管理");
  await page.getByLabel("搜索任务", { exact: true }).fill(title);
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: title, exact: true }).click();
  await dialog.getByLabel("当前状态", { exact: true }).selectOption("done");
  await dialog.getByRole("button", { name: "保存更改", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator("tbody tr").filter({ hasText: title }),
  ).toContainText("已完成");
  await page.getByRole("button", { name: title, exact: true }).click();
  await dialog.getByRole("button", { name: "删除任务", exact: true }).click();
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await dialog.getByRole("button", { name: "恢复任务", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "返回任务", exact: true }).click();
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("周历、项目、标签、历史与键盘操作", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await navigate(page, "项目进度");
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page
    .locator(".project-card")
    .first()
    .getByRole("button", { name: "查看任务", exact: true })
    .click();
  await expect(page.getByLabel("项目筛选")).toHaveValue("1");
  await navigate(page, "标签分类");
  await expect(page.locator(".tag-card")).toHaveCount(3);
  await navigate(page, "操作历史");
  await expect(page.locator(".activity").first()).toBeVisible();
  await navigate(page, "任务管理");
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("任务名称", { exact: true }),
  ).toBeFocused();
  await page
    .getByRole("dialog")
    .getByLabel("任务名称", { exact: true })
    .press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await navigate(page, "团队设置");
  await expect(page.getByRole("heading", { name: "个人账号" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加成员", exact: true }),
  ).toBeVisible();
});
