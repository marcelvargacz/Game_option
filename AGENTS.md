# AGENTS.md

<!-- workspace-hygiene-rule -->
## Workspace hygiene and cleanup

- Keep the repository and its surrounding workspace clean throughout the task.
- Create experiments, smoke tests, generated diagnostics, downloaded installers, and disposable fixtures in an isolated temporary directory whenever possible.
- After verification, remove temporary repositories, scratch files, debug output, test-only artifacts, stale logs, caches, archives, and generated files that are not required deliverables.
- Preserve only purposeful source code, tests with lasting regression value, documentation, configuration, final artifacts, and reusable automation.
- Do not delete pre-existing, user-owned, or ambiguously useful files without explicit approval.
- Never commit secrets, OAuth material, credentials, `.env` files, provider session data, or raw authentication output.
- Before declaring work complete, inspect `git status`, review untracked files, and confirm that no agent-created clutter remains.
- If a temporary artifact must be retained for an active investigation, state why it is needed and remove it once that reason no longer applies.
