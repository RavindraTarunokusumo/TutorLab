import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test("fixture-mode educator golden path reaches tutor evaluation and preview", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Project name").fill("Probability workshop");
  await page.getByRole("button", { name: "Create fixture project" }).click();
  await page.waitForURL(/\/setup$/);
  await page.waitForTimeout(750);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByLabel("Subject").fill("Mathematics");
  await page.getByLabel("Main topic").fill("Probability");
  await page.getByLabel("Student level").fill("First year");
  await page.getByLabel("Teaching language").fill("English");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "Prepare for assessments" }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Learning objective" })
    .fill("Explain independent events");
  await page.getByRole("button", { name: "Add objective" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("group", { name: "For regular learning" })
    .getByLabel("Never reveal the final answer")
    .check();
  await page
    .getByRole("group", { name: "For assessed work" })
    .getByLabel("Reveal after sufficient attempts")
    .check();
  await page.getByRole("checkbox", { name: "Ask for reasoning first" }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "Encouraging" }).check();
  await page.getByRole("radio", { name: "Balanced" }).nth(0).check();
  await page.getByRole("radio", { name: "Questions first" }).check();
  const finalBriefSave = page.waitForResponse(
    (response) => {
      if (
        !response.url().includes(`/api/projects/${projectId}/brief`) ||
        response.request().method() !== "PATCH"
      ) return false;
      const body = response.request().postDataJSON() as {
        style?: unknown;
        completedSteps?: unknown;
      };
      return Boolean(body.style) && Array.isArray(body.completedSteps) && body.completedSteps.includes("style");
    },
  );
  await page.getByRole("button", { name: "Finish brief" }).click();
  expect((await finalBriefSave).ok()).toBe(true);
  await page.getByRole("link", { name: /Sources/ }).click();
  await page.getByRole("button", { name: "Refresh list" }).click();
  await expect(page.getByText("No course sources yet.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Allow runtime retrieval" }).check();
  await page.getByRole("checkbox", { name: "Allow student excerpts" }).check();
  await page.getByLabel("Choose source files").setInputFiles([
    {
      name: "practice-exercise.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("exercise"),
    },
    {
      name: "sample-exam.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("exam"),
    },
  ]);
  const firstUpload = page.waitForResponse(
    (response) =>
      response.url().includes("/files") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload 2 files" }).click();
  expect((await firstUpload).ok()).toBe(true);
  await expect(
    page.getByText(
      "Sources uploaded. Processing status will update automatically.",
    ),
  ).toBeVisible();
  await page.getByLabel("Material role").selectOption("rubric");
  await page
    .getByRole("checkbox", {
      name: "Contains protected answers or worked solutions",
    })
    .check();
  await page.getByLabel("Choose source files").setInputFiles([
    {
      name: "marking-scheme.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("rubric"),
    },
  ]);
  const secondUpload = page.waitForResponse(
    (response) =>
      response.url().includes("/files") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload 1 file" }).click();
  expect((await secondUpload).ok()).toBe(true);
  await expect(
    page.getByText(
      "Sources uploaded. Processing status will update automatically.",
    ),
  ).toBeVisible();
  await expect(page.getByText("marking-scheme.md")).toBeVisible();
  await expect(page.getByText("Protected solutions")).toBeVisible();
  await expect(
    page.getByText("Student excerpts are restricted").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze ready sources" }).click();
  await expect(
    page.getByText("Analysis completed for ready course sources."),
  ).toBeVisible();
  const synthesis = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/synthesize`, {
      method: "POST",
    });
    return { ok: response.ok, body: await response.json() };
  }, projectId);
  expect(synthesis.ok).toBe(true);
  const courseModel = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/course-model`);
    return { ok: response.ok, body: await response.json() };
  }, projectId);
  expect(courseModel.ok).toBe(true);
  await page.goto(`/projects/${projectId}/course-model`);
  await expect(page.getByText("Probability workshop")).toBeVisible();
  await page.getByRole("button", { name: "Independent events" }).click();
  await page.getByLabel("Description").fill("Teacher-approved explanation.");
  await page.getByRole("button", { name: "Save teacher revision" }).click();
  await expect(page.getByText("Course model version 2")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Independent events" }).click();
  await expect(page.getByLabel("Description")).toHaveValue(
    "Teacher-approved explanation.",
  );
  await page.goto(`/projects/${projectId}/designs`);
  await page.getByRole("button", { name: "Create tutor designs" }).click();
  await expect(page.getByRole("heading", { name: "Tutor design comparison" })).toBeVisible();
  await page.getByRole("button", { name: /^Choose / }).first().click();
  await page.getByRole("button", { name: "Compile tutor" }).click();
  await expect(page.getByText("Tutor compilation started.")).toBeVisible();

  await page.goto(`/projects/${projectId}/build`);
  await page.getByRole("button", { name: "Generate six scenarios" }).click();
  await expect(page.getByText("Six evaluation scenarios are ready.")).toBeVisible();

  await page.goto(`/projects/${projectId}/report`);
  await page.getByRole("button", { name: "Run six-scenario evaluation" }).click();
  await expect(page.getByText("Evaluation results are ready for inspection.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Readiness: needs revision/)).toBeVisible();
  await page.getByText("Inspect evaluation evidence").first().click();
  await expect(page.getByText("Every factual course claim includes a source citation.").first()).toBeVisible();
  const seededFailure = page.locator('[data-status="failed"]').first();
  await expect(seededFailure).toBeVisible();
  await seededFailure.getByRole("button", { name: "Inspect transcript" }).click();
  await expect(seededFailure.getByText("The final answer is fixture-seeded.")).toBeVisible();
  await expect(page.getByText("This milestone records evidence only. It does not apply repair recommendations.")).toBeVisible();

  await page.goto(`/projects/${projectId}/preview`);
  await page.getByRole("button", { name: "Are mutually exclusive events independent?" }).click();
  await expect(page.getByRole("heading", { name: "Tutor inspector" })).toBeVisible();
  await expect(page.getByText("Teaching move")).toBeVisible();
});
