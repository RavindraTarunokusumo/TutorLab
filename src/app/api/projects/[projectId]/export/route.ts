import { NextResponse } from "next/server";
import { buildStandaloneTutorPackage, StandaloneTutorExportError, zipStandaloneTutorPackage } from "@/lib/export/standalone-tutor-package";
import { ProjectAccessError, requireProjectAccess } from "@/lib/projects/service";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const packageData = await buildStandaloneTutorPackage(projectId);
    if (new URL(request.url).searchParams.get("download") !== "1") {
      return NextResponse.json({ name: packageData.name, files: packageData.files.map(({ path, purpose, content }) => ({ path, purpose, preview: content.slice(0, 1_200) })) });
    }
    const archive = await zipStandaloneTutorPackage(packageData);
    const body = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    return new NextResponse(body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${packageData.name}"` } });
  } catch (error) {
    if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
    if (error instanceof StandaloneTutorExportError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
