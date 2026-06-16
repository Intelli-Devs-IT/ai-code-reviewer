import assert from "node:assert/strict";
import test from "node:test";

import { applyRiskLabel, safeRemoveLabel } from "../src/helpers/riskLabels";

const OWNER = "octo";
const REPO = "repo";
const ISSUE_NUMBER = 123;
const RISK_LABELS = [
  "ai-review: low-risk",
  "ai-review: medium-risk",
  "ai-review: high-risk",
];

test("safeRemoveLabel does not throw on 404", async () => {
  const octokit = createOctokit([], () => {
    const error = new Error("Label does not exist") as Error & { status: number };
    error.status = 404;
    throw error;
  });

  await safeRemoveLabel({
    github: octokit,
    owner: OWNER,
    repo: REPO,
    issue_number: ISSUE_NUMBER,
    name: "ai-review: low-risk",
    logger: { info: () => undefined },
  });
});

test("safeRemoveLabel throws on non-404 errors", async () => {
  const octokit = createOctokit([], () => {
    const error = new Error("GitHub API failed") as Error & { status: number };
    error.status = 500;
    throw error;
  });

  await assert.rejects(
    () =>
      safeRemoveLabel({
        github: octokit,
        owner: OWNER,
        repo: REPO,
        issue_number: ISSUE_NUMBER,
        name: "ai-review: low-risk",
      }),
    /GitHub API failed/
  );
});

test("skips missing old risk labels", async () => {
  const octokit = createOctokit(["needs-review"]);

  await applyRiskLabel(
    octokit,
    OWNER,
    REPO,
    ISSUE_NUMBER,
    "ai-review: medium-risk",
    RISK_LABELS
  );

  assert.deepEqual(octokit.removedLabels, []);
});

test("removes existing old risk labels", async () => {
  const octokit = createOctokit(["ai-review: low-risk"]);

  await applyRiskLabel(
    octokit,
    OWNER,
    REPO,
    ISSUE_NUMBER,
    "ai-review: medium-risk",
    RISK_LABELS
  );

  assert.deepEqual(octokit.removedLabels, ["ai-review: low-risk"]);
});

test("still adds the new risk label after cleanup", async () => {
  const octokit = createOctokit(["ai-review: medium-risk"]);

  await applyRiskLabel(
    octokit,
    OWNER,
    REPO,
    ISSUE_NUMBER,
    "ai-review: high-risk",
    RISK_LABELS
  );

  assert.deepEqual(octokit.addedLabels, [["ai-review: high-risk"]]);
});

test('missing label "review" does not crash safe removal', async () => {
  const octokit = createOctokit([], () => {
    const error = new Error("Label does not exist") as Error & { status: number };
    error.status = 404;
    throw error;
  });

  await safeRemoveLabel({
    github: octokit,
    owner: OWNER,
    repo: REPO,
    issue_number: ISSUE_NUMBER,
    name: "review",
    logger: { info: () => undefined },
  });
});

function createOctokit(
  labels: string[],
  removeLabel?: (labelName: string) => void
) {
  const removedLabels: string[] = [];
  const addedLabels: string[][] = [];

  return {
    removedLabels,
    addedLabels,
    rest: {
      issues: {
        listLabelsOnIssue: async () => ({
          data: labels.map((name) => ({ name })),
        }),
        removeLabel: async ({ name }: { name: string }) => {
          removeLabel?.(name);
          removedLabels.push(name);
        },
        addLabels: async ({ labels }: { labels: string[] }) => {
          addedLabels.push(labels);
        },
      },
    },
  };
}
