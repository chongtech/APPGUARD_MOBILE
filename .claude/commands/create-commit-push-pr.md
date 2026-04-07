Commit, push and create PR: $ARGUMENTS

Parse arguments (format: "commit message" or "commit message | PR title | PR body"):
- Commit message (required)
- PR title (optional, defaults to commit message)
- PR body/description (optional, defaults to list of changes)

Execute:
1. git status (show what will be committed)
2. git add .
3. Examines recent commit messages to match your repository's style
4. Drafts an appropriate commit message
5. git commit -m "<commit-message>"
6. git push -u origin HEAD
7. Create PR:
   gh pr create --title "<pr-title>" --body "<pr-body>" --base main --fill

If PR creation has been sucessufully created run the /code-review and then code-simplifier plugin use plan mode

If PR creation fails, provide the URL: https://github.com/<owner>/<repo>/compare/<branch>?expand=1

Output the PR URL when complete.
```


