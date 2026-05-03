/**
 * Substrate constants — fallback defaults when no `.project/config.json`
 * exists, or when one exists with `root: ".project"` (the default).
 *
 * For context-aware path resolution honoring `config.root`, import the
 * helpers (projectDir, schemasDir, schemaPath, agentsDir,
 * projectTemplatesDir, projectRoot) from `./project-context.js`. The
 * helpers in this module were retired in the PROJECT_DIR retrofit (issue-077).
 *
 * Bootstrap exemption: config.json + relations.json themselves live at
 * `<cwd>/<PROJECT_DIR>/...` regardless of config.root, because they are
 * the substrate that DEFINES root. Use these constants directly when
 * resolving the bootstrap location of those two files.
 */

export const PROJECT_DIR = ".project";
export const SCHEMAS_DIR = "schemas";
