import "server-only";
import courseModelFixture from "../../../fixtures/probability-course/course-model.json";
import pipelineJobFixture from "../../../fixtures/probability-course/pipeline-job.json";
import { parseCourseModel, parsePipelineJob } from "@/lib/schemas";

export const fixturePreview = {
  courseModel: parseCourseModel(courseModelFixture),
  pipelineJob: parsePipelineJob(pipelineJobFixture),
};
