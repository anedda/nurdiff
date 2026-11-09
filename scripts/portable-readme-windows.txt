NurDiff - portable build for Windows
====================================

NurDiff compares files and folders: side by side, unified, or as a map of the
folder tree. This is the portable build: nothing to install.

How to start
------------
1. Unzip the whole folder anywhere (for example C:\Tools\NurDiff).
2. Run nurdiff.exe.

Keep nurdiff.exe and nurdiff-cli.exe in the same folder: the command-line tool
(nurdiff-cli.exe) looks for the window next to itself.

Requirements
------------
- Windows 10 or 11, 64-bit.
- The Microsoft WebView2 runtime. Windows 10 and 11 normally have it already.
  If NurDiff does not start, or Windows says WebView2 is missing, install the
  "Evergreen" runtime from:
  https://developer.microsoft.com/microsoft-edge/webview2/
- If Windows reports a missing VCRUNTIME140.dll, install the Microsoft Visual
  C++ Redistributable (x64).
- No administrator rights are needed.

Windows warning at the first start
----------------------------------
The program is not signed with a code-signing certificate, so Windows
SmartScreen may say "Windows protected your PC". Choose "More info", then "Run
anyway". To check that the file is the one built by the project, compare its
checksum with SHA256SUMS on the release page (see "Verifying a download" in
the project page).

Using it with Git
-----------------
Open a command prompt in this folder and run:

    nurdiff-cli.exe --setup-git

It writes the settings for "git difftool" into your global Git configuration,
using the full path of nurdiff-cli.exe because this folder is not in the PATH.
If you move the folder, run the command again. "nurdiff-cli.exe --remove-git"
undoes it.

Your settings
-------------
NurDiff saves its settings in %USERPROFILE%\.nurdiff (settings.json,
recents.json, state.json). To remove NurDiff, delete its folder and, if you
want, that one.

More information
----------------
Project page, documentation and issues: https://github.com/anedda/nurdiff
License: see the LICENSE file in this folder (GNU GPL version 3 or later).
