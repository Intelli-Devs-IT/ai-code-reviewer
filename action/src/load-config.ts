import * as github from "@actions/github";
import * as yaml from "js-yaml";
import { minimatch } from "minimatch";
import { DEFAULT_CONFIG, ReviewerConfig } from "./config";

export async function loadConfig(
  octokit: any,
  owner: string,
  repo: string,
  ref: string
): Promise<ReviewerConfig> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".ai-reviewer.yml",
      ref,
    });

    if (!("content" in response.data)) return DEFAULT_CONFIG;

    const decoded = Buffer.from(response.data.content, "base64").toString(
      "utf-8"
    );

    const parsed = yaml.load(decoded) as Partial<ReviewerConfig>;

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function fileMatchesConfig(
  filename: string,
  config: ReviewerConfig
): boolean {
  const included = config.include.some((pattern) =>
    minimatch(filename, pattern)
  );

  const excluded = config.exclude.some((pattern) =>
    minimatch(filename, pattern)
  );

  return included && !excluded;
}
