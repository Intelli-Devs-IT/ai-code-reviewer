export interface FetchFileSourceParams {
  github: any;
  owner: string;
  repo: string;
  filePath: string;
  headSha: string;
}

interface GitTreeEntry {
  path?: string;
  type?: string;
  sha?: string;
}

interface Logger {
  warning: (message: string) => void;
}

export class FileSourceFetcher {
  private treeCache = new Map<string, GitTreeEntry[]>();

  constructor(private readonly logger?: Logger) {}

  async fetchFileSourceFromHead(
    params: FetchFileSourceParams
  ): Promise<string | null> {
    try {
      const tree = await this.getTreeEntries(params);
      const entry = tree.find((item) => item.path === params.filePath);

      if (!entry) {
        this.warn(params, "file_not_found_in_tree");
        return null;
      }

      if (entry.type !== "blob" || !entry.sha) {
        this.warn(params, "tree_entry_is_not_blob");
        return null;
      }

      const { data } = await params.github.rest.git.getBlob({
        owner: params.owner,
        repo: params.repo,
        file_sha: entry.sha,
      });

      if (data.encoding !== "base64" || !data.content) {
        this.warn(params, "blob_content_not_base64");
        return null;
      }

      return Buffer.from(data.content, "base64").toString("utf8");
    } catch {
      this.warn(params, "fetch_failed");
      return null;
    }
  }

  private async getTreeEntries(
    params: FetchFileSourceParams
  ): Promise<GitTreeEntry[]> {
    const cacheKey = `${params.owner}/${params.repo}:${params.headSha}`;
    const cached = this.treeCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const { data } = await params.github.rest.git.getTree({
      owner: params.owner,
      repo: params.repo,
      tree_sha: params.headSha,
      recursive: "true",
    });
    const tree = Array.isArray(data.tree) ? data.tree : [];

    this.treeCache.set(cacheKey, tree);
    return tree;
  }

  private warn(params: FetchFileSourceParams, reason: string): void {
    this.logger?.warning(
      `Failed to fetch source for ${params.filePath} at ${params.headSha.slice(
        0,
        7
      )}: ${reason}`
    );
  }
}
