Create a new git branch based on the following input: $ARGUMENTS

Parse the input to determine:
- Branch name (required)
- Base branch (optional, default to main or master)

Execute:
1. git fetch origin
2. git checkout <base-branch>
3. git pull origin <base-branch>
4. git checkout -b <new-branch-name>
5. git push -u origin $ARGUMENTS
6. Verify with: git branch -vv (to show tracking info)

Confirm success by showing the remote tracking branch is set up.