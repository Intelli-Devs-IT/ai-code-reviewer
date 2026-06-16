export interface RiskLabelLogger {
  info(message: string): void;
}

export interface SafeRemoveLabelParams {
  github: any;
  owner: string;
  repo: string;
  issue_number: number;
  name: string;
  logger?: RiskLabelLogger;
}

export async function safeRemoveLabel({
  github,
  owner,
  repo,
  issue_number,
  name,
  logger,
}: SafeRemoveLabelParams): Promise<void> {
  try {
    await github.rest.issues.removeLabel({
      owner,
      repo,
      issue_number,
      name,
    });
  } catch (error: any) {
    if (error?.status === 404) {
      logger?.info(`Label "${name}" was not present. Skipping removal.`);
      return;
    }

    throw error;
  }
}

export async function applyRiskLabel(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  selectedLabel: string,
  riskLabels: string[],
  logger?: RiskLabelLogger
): Promise<void> {
  const { data: currentLabels } = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number: issueNumber,
  });

  const existingLabelNames = new Set(
    currentLabels.map((label: { name: string }) => label.name)
  );

  for (const labelName of riskLabels) {
    if (!existingLabelNames.has(labelName)) {
      continue;
    }

    await safeRemoveLabel({
      github: octokit,
      owner,
      repo,
      issue_number: issueNumber,
      name: labelName,
      logger,
    });
  }

  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [selectedLabel],
  });
}
