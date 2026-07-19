import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CreateProjectInputSchema } from "@/lib/schemas/project";
import { createProject } from "@/lib/projects/service";
import {
  PROJECT_EDIT_COOKIE,
  projectEditCookieName,
} from "@/lib/projects/auth";
import {
  hasOpenAIKeyForRequest,
  OPENAI_KEY_REQUIRED,
} from "@/lib/ai/session-key";

function invalidRequest() {
  return NextResponse.json(
    { error: "Invalid project request" },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  if (!hasOpenAIKeyForRequest(request)) {
    return NextResponse.json(
      {
        error: "An OpenAI API key is required to create a project.",
        code: OPENAI_KEY_REQUIRED,
      },
      { status: 428 },
    );
  }

  try {
    const input = CreateProjectInputSchema.parse(await request.json());
    const { project, editToken } = await createProject(input);
    const response = NextResponse.json({ project }, { status: 201 });

    const cookieOptions = {
      value: editToken,
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };
    response.cookies.set({ name: PROJECT_EDIT_COOKIE, ...cookieOptions });
    response.cookies.set({
      name: projectEditCookieName(project.id),
      ...cookieOptions,
    });
    return response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return invalidRequest();
    }
    throw error;
  }
}
