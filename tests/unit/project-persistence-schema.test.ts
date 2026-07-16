import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectDirectory = process.cwd();
const schema = readFileSync(
  path.join(projectDirectory, "prisma", "schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  path.join(
    projectDirectory,
    "prisma",
    "migrations",
    "20260715194000_add_project_persistence",
    "migration.sql",
  ),
  "utf8",
);

describe("project-contained persistence relations", () => {
  it("requires analyses and jobs to reference source documents in their own project", () => {
    expect(schema).toContain("@@unique([projectId, id])");
    expect(schema).toContain(
      "@relation(fields: [projectId, documentId], references: [projectId, id], onDelete: Restrict)",
    );
    expect(schema).toContain(
      "@relation(fields: [projectId, sourceDocumentId], references: [projectId, id], onDelete: Restrict)",
    );
    expect(migration).toContain(
      'FOREIGN KEY ("projectId", "documentId") REFERENCES "SourceDocument"("projectId", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("projectId", "sourceDocumentId") REFERENCES "SourceDocument"("projectId", "id")',
    );
  });
});
