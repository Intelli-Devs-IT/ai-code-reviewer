export function extractLineNumbersFromPatch2(patch: string): number[] {
  const lines = patch.split("\n");

  const commentLines: number[] = [];
  let newLineNumber = 0;
  let inHunk = false;
  let foundInCurrentHunk = false;

  for (const line of lines) {
    // Start of a new hunk
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        newLineNumber = parseInt(match[1], 10) - 1;
        inHunk = true;
        foundInCurrentHunk = false;
      }
      continue;
    }

    if (!inHunk) continue;

    // Increment new-file line count for context or added lines
    if (!line.startsWith("-")) {
      newLineNumber++;
    }

    // First added line in this hunk → record it
    if (
      line.startsWith("+") &&
      !line.startsWith("+++") &&
      !foundInCurrentHunk
    ) {
      commentLines.push(newLineNumber);
      foundInCurrentHunk = true;
    }
  }

  return commentLines;
}

async function findExistingComment(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  filename: string
) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const marker = `<!-- ai-code-reviewer-FB:file=${filename} -->`;

  return comments.find(
    (comment: any) => comment.body && comment.body.includes(marker)
  );
}

//  if (existingComment) {
//         await octokit.rest.issues.updateComment({
//           owner,
//           repo,
//           comment_id: existingComment.id,
//           body: commentBody,
//         });
//         core.info(`Updated AI review for ${file.filename}`);
//         continue;
//       } else {
//         await octokit.rest.pulls.createReviewComment({
//           owner,
//           repo,
//           pull_number: pr.number,
//           commit_id: commitSha,
//           path: file.filename,
//           line,
//           side: "RIGHT",
//           body: `
// ${marker}
// 🤖 **AI Code Review**

// ${review}
// `,
//         });

//         core.info(`Posted inline review for ${file.filename}`);
//         // await octokit.rest.issues.createComment({
//         //   owner,
//         //   repo,
//         //   issue_number: pr.number,
//         //   body: commentBody,
//         // });

//         // core.info(`Posted AI review for ${file.filename}`);
//       }
