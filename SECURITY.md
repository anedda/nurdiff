# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use [private vulnerability reporting](https://github.com/anedda/nurdiff/security/advisories/new) (the **Report a vulnerability** button in the *Security* tab of the repository) and describe what you found, the version, your system and, if you can, how to reproduce it.

You will get an answer as soon as possible. A fix is published in a new release, and the advisory credits you unless you prefer otherwise.

## What is covered

The latest release. Older versions are not patched.

NurDiff reads the files you give it, opens archives into a temporary folder and, on request, writes merged files back. Problems in how it handles hostile input (an archive that writes outside its folder, a file that makes it crash or exhaust memory) are in scope. It does not copy, mirror or delete files between folders, and it makes no network connections.
