import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { TeachingBriefPatchSchema } from "@/lib/schemas/project";
import {
  ProjectAccessError,
  requireProjectAccess,
  saveTeachingBrief,
} from "@/lib/projects/service";

function invalidRequest() {
  return NextResponse.json({ error: "Invalid teaching brief" }, { status: 400 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const patch = TeachingBriefPatchSchema.parse(await request.json());
    const project = await saveTeachingBrief(projectId, patch);
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json(
        { error: error.status === 401 ? "Unauthorized" : "Not found" },
        { status: error.status },
      );
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return invalidRequest();
    }
    throw error;
  }
}
