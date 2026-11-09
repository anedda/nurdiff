# Using NurDiff with Git

NurDiff can be Git's diff viewer. You need the two executables **next to each other**: `nurdiff-cli` and `nurdiff` (the window), or `nurdiff` in the `PATH`, or its path in `$NURDIFF_GUI`. The installers carry both:

| Package | Where `nurdiff-cli` goes |
|---|---|
| `.deb`, `.rpm` | `/usr/bin/nurdiff-cli`, next to `/usr/bin/nurdiff`: it is already in the `PATH` |
| Windows portable `.zip` | `nurdiff-cli.exe` next to `nurdiff.exe` in the unzipped folder: use its full path in the Git settings |
| Windows installer | `nurdiff-cli.exe` in the installation folder, next to `nurdiff.exe` (**not** added to the `PATH`: use its full path in the Git settings) |
| macOS | inside the app: `NurDiff.app/Contents/MacOS/nurdiff-cli` (link it with `ln -s /Applications/NurDiff.app/Contents/MacOS/nurdiff-cli /usr/local/bin/nurdiff-cli`) |
| AppImage | **not included**: take `nurdiff-cli` from the release archive and set `NURDIFF_GUI` to the AppImage |

The Windows and macOS rows describe how the installers are built; the release notes say what has been tried by hand.

The quickest way to set Git up is to let NurDiff write the settings:

```sh
nurdiff-cli --setup-git               # diff.tool, difftool.nurdiff.cmd, difftool.prompt (global)
nurdiff-cli --setup-git --external    # ...and make plain `git diff` open NurDiff too
nurdiff-cli --remove-git              # undo it
```

It prints every value it writes (and the one it replaces), in your global Git configuration. The app does the same from **Tools → Options → Git** (it needs `nurdiff-cli` next to the app). By hand, it is:

```sh
git config --global diff.tool nurdiff
git config --global difftool.nurdiff.cmd 'nurdiff-cli --gui "$LOCAL" "$REMOTE"'
git config --global difftool.prompt false
git difftool                              # one file at a time
git difftool --dir-diff --no-symlinks     # the whole change as a folder comparison

# optional: make plain `git diff` open NurDiff too
git config --global diff.external 'nurdiff-cli --git-external'
```

If you take `nurdiff-cli` from the separate command-line archive instead, put it next to the app or set `NURDIFF_GUI` (on macOS: `/Applications/NurDiff.app/Contents/MacOS/nurdiff`).

The temporary copy of the old version that Git creates is opened **read-only**. `--no-symlinks` is needed because otherwise Git puts links to the real files in the right-hand folder, and NurDiff would compare them as links.

## Resolving merge conflicts (`git mergetool`)

NurDiff can also resolve the conflicts of a merge. Git has already merged what it could and has written the rest between conflict markers; NurDiff shows each conflict with its **local** and **remote** side (and the common ancestor, with `merge.conflictStyle=diff3`) and you take the local side, the remote one, both, or write the text by hand. **Save and close** writes the file and exits with `0`, which tells Git the file is resolved; closing with a conflict left makes Git keep the file as conflicted.

```sh
nurdiff-cli --setup-git --mergetool     # or: Tools → Options → Git → "git mergetool"
git mergetool --no-prompt
```

By hand: `git config --global merge.tool nurdiff`, `mergetool.nurdiff.cmd 'nurdiff-cli --merge "$MERGED"'` and `mergetool.nurdiff.trustExitCode true`. This is **not a three-way merge editor**: it only resolves the conflicts Git left in the file, it does not recompute the merge, and it shows the base only if Git wrote it. In a `git rebase` "local" and "remote" are swapped, as in every Git merge tool.
