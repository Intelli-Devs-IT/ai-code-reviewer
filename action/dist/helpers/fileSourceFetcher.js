"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSourceFetcher = void 0;
class FileSourceFetcher {
    constructor(logger) {
        this.logger = logger;
        this.treeCache = new Map();
    }
    async fetchFileSourceFromHead(params) {
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
        }
        catch {
            this.warn(params, "fetch_failed");
            return null;
        }
    }
    async getTreeEntries(params) {
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
    warn(params, reason) {
        this.logger?.warning(`Failed to fetch source for ${params.filePath} at ${params.headSha.slice(0, 7)}: ${reason}`);
    }
}
exports.FileSourceFetcher = FileSourceFetcher;
