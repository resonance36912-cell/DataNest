import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRonsAuth } from "@/lib/rons-auth-middleware";
import { hasBackendRole } from "@/lib/backend-provider.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { memoizeRequest } from "./request-memo.server";
import { githubJson } from "./github-provider.server";

async function ghFetch(path: string) {
  return githubJson(path, { method: "GET" });
}

async function requireAdmin(ctx: { userId: string }) {
  if (!(await hasBackendRole(ctx.userId, "admin", supabaseAdmin))) throw new Error("Forbidden");
}

export type WorkflowRunSummary = {
  id: number;
  name: string | null;
  status: string | null; // queued, in_progress, completed
  conclusion: string | null; // success, failure, cancelled, skipped, timed_out, action_required, neutral, null
  html_url: string;
  event: string | null;
  head_sha: string;
  run_number: number | null;
  created_at: string;
  updated_at: string;
};

export type GhRelease = {
  id: number;
  name: string | null;
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at: string;
  author: { login: string; avatar_url: string } | null;
  body: string | null;
  target_commitish: string;
  repo: string;
  age_days: number;
  runs: WorkflowRunSummary[];
  runs_error?: string;
};

export const listRecentReleases = createServerFn({ method: "POST" })
  .middleware([requireRonsAuth])
  .validator((data: { repos: string[]; perRepo?: number }) =>
    z
      .object({
        repos: z
          .array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo"))
          .min(1)
          .max(10),
        perRepo: z.number().int().min(1).max(20).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    const now = Date.now();
    const limit = data.perRepo ?? 10;

    const perRepo = await Promise.all(
      data.repos.map(async (repo) => {
        try {
          const releases = (await ghFetch(
            `/repos/${repo}/releases?per_page=${limit}`,
          )) as any[];

          const loadWorkflowRuns = memoizeRequest(
            async (target: string): Promise<WorkflowRunSummary[]> => {
              const query = /^[0-9a-f]{7,40}$/i.test(target)
                ? `head_sha=${target}`
                : `branch=${encodeURIComponent(target)}&event=push`;
              const wr = (await ghFetch(
                `/repos/${repo}/actions/runs?${query}&per_page=20`,
              )) as any;
              return ((wr?.workflow_runs ?? []) as any[])
                .slice(0, 10)
                .map<WorkflowRunSummary>((run) => ({
                  id: run.id,
                  name: run.name ?? run.workflow_id ?? null,
                  status: run.status ?? null,
                  conclusion: run.conclusion ?? null,
                  html_url: run.html_url,
                  event: run.event ?? null,
                  head_sha: run.head_sha,
                  run_number: run.run_number ?? null,
                  created_at: run.created_at,
                  updated_at: run.updated_at,
                }));
            },
          );

          const enriched = await Promise.all(
            releases.map(async (r) => {
              let runs: WorkflowRunSummary[] = [];
              let runs_error: string | undefined;
              // Share one lookup per release target within this repository request.
              try {
                runs = await loadWorkflowRuns(r.target_commitish);
              } catch (err) {
                runs_error = (err as Error).message;
              }

              const publishedAt = r.published_at ?? r.created_at;
              const ageMs = publishedAt ? now - new Date(publishedAt).getTime() : 0;

              return {
                id: r.id,
                name: r.name ?? null,
                tag_name: r.tag_name,
                html_url: r.html_url,
                draft: !!r.draft,
                prerelease: !!r.prerelease,
                published_at: r.published_at ?? null,
                created_at: r.created_at,
                author: r.author
                  ? { login: r.author.login, avatar_url: r.author.avatar_url }
                  : null,
                body: r.body ?? null,
                target_commitish: r.target_commitish,
                repo,
                age_days: Math.max(0, Math.floor(ageMs / 86400000)),
                runs,
                runs_error,
              } as GhRelease;
            }),
          );
          return enriched;
        } catch (err) {
          return { __error: (err as Error).message, repo };
        }
      }),
    );

    const releases: GhRelease[] = [];
    const errors: { repo: string; message: string }[] = [];
    for (const r of perRepo) {
      if (Array.isArray(r)) releases.push(...r);
      else errors.push({ repo: r.repo, message: r.__error });
    }
    // Sort newest first across repos
    releases.sort((a, b) => {
      const ta = new Date(a.published_at ?? a.created_at).getTime();
      const tb = new Date(b.published_at ?? b.created_at).getTime();
      return tb - ta;
    });
    return { releases, errors, fetchedAt: new Date().toISOString() };
  });
