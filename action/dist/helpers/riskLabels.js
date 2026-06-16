"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeRemoveLabel = safeRemoveLabel;
exports.applyRiskLabel = applyRiskLabel;
async function safeRemoveLabel({ github, owner, repo, issue_number, name, logger, }) {
    try {
        await github.rest.issues.removeLabel({
            owner,
            repo,
            issue_number,
            name,
        });
    }
    catch (error) {
        if (error?.status === 404) {
            logger?.info(`Label "${name}" was not present. Skipping removal.`);
            return;
        }
        throw error;
    }
}
async function applyRiskLabel(octokit, owner, repo, issueNumber, selectedLabel, riskLabels, logger) {
    const { data: currentLabels } = await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: issueNumber,
    });
    const existingLabelNames = new Set(currentLabels.map((label) => label.name));
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
