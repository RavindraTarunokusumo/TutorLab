import { NextResponse } from "next/server";
import {
  getProjectEditToken,
  projectEditCookieName,
} from "@/lib/projects/auth";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const editToken = getProjectEditToken(request, projectId);
    if (!editToken) throw new ProjectAccessError(401);

    const response = NextResponse.json({ restored: true });
    response.cookies.set({
      name: projectEditCookieName(projectId),
      value: editToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return response;
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json(
        { error: error.status === 401 ? "Unauthorized" : "Not found" },
        { status: error.status },
      );
    }
    throw error;
  }
}
