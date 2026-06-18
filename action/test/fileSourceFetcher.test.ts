import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FileSourceFetcher } from "../src/helpers/fileSourceFetcher";

const baseParams = {
  owner: "octo",
  repo: "repo",
  headSha: "abc123456789",
};

test("fetches source using git tree and blob APIs", async () => {
  const source = "export function add(a: number, b: number) {\n  return a + b;\n}\n";
  const github = {
    rest: {
      git: {
        getTree: async () => ({
          data: {
            tree: [{ path: "src/add.ts", type: "blob", sha: "blob-sha" }],
          },
        }),
        getBlob: async (params: any) => {
          assert.equal(params.file_sha, "blob-sha");
          return {
            data: {
              encoding: "base64",
              content: Buffer.from(source, "utf8").toString("base64"),
            },
          };
        },
      },
    },
  };

  const fetcher = new FileSourceFetcher();
  const result = await fetcher.fetchFileSourceFromHead({
    ...baseParams,
    github,
    filePath: "src/add.ts",
  });

  assert.equal(result, source);
});

test("returns null when file is missing from tree", async () => {
  const warnings: string[] = [];
  const github = {
    rest: {
      git: {
        getTree: async () => ({ data: { tree: [] } }),
        getBlob: async () => {
          throw new Error("getBlob should not be called");
        },
      },
    },
  };

  const fetcher = new FileSourceFetcher({
    warning: (message) => warnings.push(message),
  });
  const result = await fetcher.fetchFileSourceFromHead({
    ...baseParams,
    github,
    filePath: "src/missing.ts",
  });

  assert.equal(result, null);
  assert.match(warnings[0], /file_not_found_in_tree/);
});

test("returns null when tree entry is not a blob", async () => {
  const warnings: string[] = [];
  const github = {
    rest: {
      git: {
        getTree: async () => ({
          data: {
            tree: [{ path: "src", type: "tree", sha: "tree-sha" }],
          },
        }),
        getBlob: async () => {
          throw new Error("getBlob should not be called");
        },
      },
    },
  };

  const fetcher = new FileSourceFetcher({
    warning: (message) => warnings.push(message),
  });
  const result = await fetcher.fetchFileSourceFromHead({
    ...baseParams,
    github,
    filePath: "src",
  });

  assert.equal(result, null);
  assert.match(warnings[0], /tree_entry_is_not_blob/);
});

test("caches recursive tree per head sha", async () => {
  let treeFetches = 0;
  const github = {
    rest: {
      git: {
        getTree: async () => {
          treeFetches += 1;
          return {
            data: {
              tree: [
                { path: "src/a.ts", type: "blob", sha: "a-sha" },
                { path: "src/b.ts", type: "blob", sha: "b-sha" },
              ],
            },
          };
        },
        getBlob: async (params: any) => ({
          data: {
            encoding: "base64",
            content: Buffer.from(params.file_sha, "utf8").toString("base64"),
          },
        }),
      },
    },
  };

  const fetcher = new FileSourceFetcher();
  const first = await fetcher.fetchFileSourceFromHead({
    ...baseParams,
    github,
    filePath: "src/a.ts",
  });
  const second = await fetcher.fetchFileSourceFromHead({
    ...baseParams,
    github,
    filePath: "src/b.ts",
  });

  assert.equal(first, "a-sha");
  assert.equal(second, "b-sha");
  assert.equal(treeFetches, 1);
});

test("source fetch failure returns null without logging source or secret text", async () => {
  const warnings: string[] = [];
  const github = {
    rest: {
      git: {
        getTree: async () => {
          throw new Error("Bearer secret-token full source text");
        },
        getBlob: async () => {
          throw new Error("getBlob should not be called");
        },
      },
    },
  };

  const fetcher = new FileSourceFetcher({
    warning: (message) => warnings.push(message),
  });
  const result = await fetcher.fetchFileSourceFromHead({
    ...baseParams,
    github,
    filePath: "src/private.ts",
  });

  assert.equal(result, null);
  assert.match(warnings[0], /fetch_failed/);
  assert.doesNotMatch(warnings[0], /secret-token/);
  assert.doesNotMatch(warnings[0], /full source text/);
});

test("full source review path does not use deprecated repos.getContent", () => {
  const indexSource = readFileSync("src/index.ts", "utf8");

  assert.doesNotMatch(indexSource, /repos\.getContent/);
  assert.match(indexSource, /fetchFileSourceFromHead/);
});
