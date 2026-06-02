/**
 * cleanGitEnv — repo-isolation env for child git processes.
 *
 * git invoked inside a hook (e.g. husky pre-commit) exports GIT_DIR /
 * GIT_INDEX_FILE / GIT_WORK_TREE / GIT_PREFIX (and the object/common-dir
 * family) pointing at the OUTER repo. A child `git` that inherits
 * process.env is silently redirected to that repo/index — corrupting
 * writes, returning wrong-repo reads. Every git subprocess MUST pass
 * `env: cleanGitEnv()` so cwd alone determines the target repo.
 */
const REPO_REDIRECTING_GIT_VARS = [
	"GIT_DIR",
	"GIT_INDEX_FILE",
	"GIT_WORK_TREE",
	"GIT_PREFIX",
	"GIT_COMMON_DIR",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_NAMESPACE",
	"GIT_CEILING_DIRECTORIES",
] as const;

export function cleanGitEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of REPO_REDIRECTING_GIT_VARS) {
		delete env[key];
	}
	return env;
}
