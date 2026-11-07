# Pull request issue policy

Every pull request, including automated dependency updates, must link at least one real GitHub issue. Use `Closes #123` in its description (or `Closes owner/repository#123`). Target the default branch so GitHub recognizes closing links. GitHub closes the linked issue when the PR merges, so choose an issue this PR actually resolves.

The `Linked issue` check queries GitHub's actual closing-issue relationship instead of accepting arbitrary text, nonexistent numbers or another PR. It runs on opening, description edits, new commits, reopening and readiness changes. It uses read-only permissions and never checks out or executes PR code. API failures fail the check.

Adding or removing a sidebar link may not emit a pull-request workflow event. Edit the description or rerun the check after changing a sidebar link. Reviewers must verify the current issue link before approving; metadata-only changes can race with merge and no Actions check atomically locks PR metadata.

## Required repository setting

After this workflow is merged and has run, an administrator must add `Linked issue` to the existing required status checks for the protected default branch, without removing current checks or owner-review requirements. Select GitHub Actions as the expected source where supported. Preserve protection against unreviewed workflow changes.

A template or successful workflow run alone is not merge enforcement. Until the required-check setting is applied, this policy is advisory. This change does not alter repository settings, merge, publish or bypass approvals.

For bot-authored agent PRs, include the real closing reference in the final commit message so the existing PR-opening workflow carries it into the description. Automated dependency PRs must also carry a real issue link; bots have no exemption.
