# Updates

How the app updates itself, and how to publish a release it can update to.

## How it works

There is no update server. The app reads the latest GitHub release of
[Nayel85/Aion2-Overlay](https://github.com/Nayel85/Aion2-Overlay) with
[electron-updater](https://www.electron.build/auto-update), and installs it over itself.

1. **Settings → Updates → Check for updates.** The app downloads `latest.yml` from the latest
   release: the version, the installer's file name, size and SHA-512.
2. **A newer version** shows its version, date and release notes, and a **Download** button. A
   pill in the dashboard's title bar says "Update x.y.z available" (it opens Settings).
3. **Download** fetches the installer, with a progress bar.
4. **Restart and install** closes the app, runs the installer silently over this copy (per-user
   NSIS, no admin rights) and starts the app again. If you don't restart, the update installs
   when the app quits.

Nothing happens by itself: the app never checks or downloads unless you press the button.
Downloaded updates don't carry Windows' "downloaded from the internet" mark, so SmartScreen
only warns on the first, hand-installed copy.

### The repository is private: the token

The releases are read through GitHub's API with a **read-only token built into the app**:

- At build time, `app/electron.vite.config.ts` takes it from the `LOKTHAR_UPDATE_TOKEN`
  environment variable, else from `app/update-token.txt` (ignored by git), and builds it in as
  `__UPDATE_TOKEN__`.
- The release workflow passes the repository secret `UPDATE_TOKEN` (Settings → Secrets and
  variables → Actions) as `LOKTHAR_UPDATE_TOKEN`.
- `app/src/main/updater.ts` gives it to electron-updater (`private: true`) and uses it for the
  release files it fetches itself (the portable zip).

A build without the token finds no update: the API answers 404 for a private repository. The
token only needs to read the repository's contents (a fine-grained token, *Contents: Read-only*,
on this repository alone). Anyone with the app can pull it out of it, so it must never be given
more than that. When it expires, make a new one, put it in the secret and in
`app/update-token.txt`, and release: copies built with the old one can no longer see updates and
need that release installed by hand.

### Where it lives

| Piece | File |
|---|---|
| The updater: check, download, install, state | `app/src/main/updater.ts` |
| Its state, shared with the windows | `app/src/shared/update.ts` |
| IPC: `update:get`, `update:check`, `update:download`, `update:install`; event `update:state` | `app/src/shared/ipc.ts`, `app/src/main/ipc.ts` |
| The Updates section | `app/src/renderer/src/components/dashboard/SettingsView.vue` |
| The title bar pill | `app/src/renderer/src/pages/PanelPage.vue` |
| Where releases are read from (`publish:`) | `app/electron-builder.yml` |
| The token built in | `app/electron.vite.config.ts`, `app/update-token.txt` |
| Building and releasing, with `latest.yml` and the blockmap | `.github/workflows/build.yml` |

The updater's requests go through electron-updater's own session (`electron-updater`
partition), not the windows' session that `app/src/main/index.ts` blocks. The app goes online
only for this check (by hand) and the optional Lokthar field boss sync.

In development (`npm run dev`) there is nothing to update: the section says so and the button is
off.

### The portable copy

A copy unpacked from `Nayel-Overlay-<version>-portable.zip` has no installer to run (it is told
apart by having no `Uninstall … .exe` next to it). It checks the same way; **Download** fetches the
new zip, checks it against the release's SHA-256 and unpacks it next to the system's temp files.
On quitting, a small script waits for the app to close, copies the new files over the folder and
starts it again. The data (`%APPDATA%\Nayel Overlay`) is untouched either way.

## Requirements

- **The token must be built in** (above): without it a private repository's releases are
  invisible to the app.
- **The release must be a normal release**, not a draft or a pre-release.
- **The tag must be `v` + the app's version**, exactly: `app/package.json` `"version": "0.3.17"`
  is released as `v0.3.17`. A version with a suffix (`0.3.17-beta.1`) is a pre-release and the
  updater skips it.
- **The release must hold `latest.yml`** next to the installer (the workflow attaches it).

## Publishing a release

1. Set the version in `app/package.json` (and `app/package-lock.json`):
   ```json
   "version": "0.3.17"
   ```
   and check that `app/src/shared/changelog.ts` has that version at the top, one short line per
   change, with each line's French in `app/src/shared/i18n.fr.ts` (the app's What's new page
   shows them).
2. Commit it, then tag the same version and push the branch and the tag:
   ```sh
   git commit -am "0.3.17"
   git tag v0.3.17
   git push nayel nayel:main v0.3.17
   ```
3. The **Build** workflow (`.github/workflows/build.yml`) runs on the tag: engine tests,
   typecheck, `npm run dist` with the token, then a release named after the tag with:
   - `Nayel-Overlay-Setup-0.3.17.exe`, the installer, its `.sha256` and its `.blockmap` (for
     downloading only what changed)
   - `latest.yml`, what the app reads
   - `Nayel-Overlay-0.3.17-portable.zip` and its `.sha256`, the portable copy
   - `Nayel-Overlay-0.3.17-installer.zip` and its `.sha256`: the installer zipped, for browsers
     and chats that block an `.exe`
   - `Nayel-Overlay-installer.zip`: the same without the version, so
     `…/releases/latest/download/Nayel-Overlay-installer.zip` is always the newest
4. Copies see it at Settings → Updates → Check for updates.

To build without releasing, run the workflow by hand (Actions → Build → Run workflow): the
same files are kept as the run's artifact, and no release is made.

## First install

Copies installed before the updater existed (0.3.0 and older) can't update themselves:
install the first release that has it by hand, once. Every release after that can come through
Settings → Updates.

The installer is not code-signed, so Windows shows "Windows protected your PC" on that first
install: **More info → Run anyway**. Npcap (https://npcap.com) must be installed too.

## Testing an update

1. Release `v0.3.16` and install it by hand.
2. Release `v0.3.17`.
3. In 0.3.16: Settings → Updates → Check for updates → Download → Restart and install.
4. The app comes back as 0.3.17 (the version shows in Settings and at the bottom of the
   sidebar).

## When it fails

The Updates section shows the error; the details are in the log (Settings → Show log, lines
starting `update:`).

| Message | Cause |
|---|---|
| 404, or "Cannot find latest.yml" | No token built in, or it expired or was revoked; the release has no `latest.yml`; or it is a draft or pre-release |
| 401 Bad credentials | The token built in expired or was revoked: a new one, then a release installed by hand |
| "No published versions on GitHub" | No normal release exists yet |
| The check says you're up to date after a release | The release is still building (Actions), the tag doesn't match `app/package.json`'s version, or the version wasn't raised |
| SHA-512 checksum mismatch | The installer on the release was replaced after `latest.yml` was made: build and release again |
| The install fails | The app couldn't close (the engine still running); quit from the tray and run the downloaded installer from `%LOCALAPPDATA%\aion2-drop-tracker-updater` |

## Signing

Updates work without code signing. If the installer is signed later (SignPath Foundation's free
signing for open-source projects, or a Certum certificate), electron-updater also checks that each update is signed by the
same publisher before installing it; set `win.publisherName` in `electron-builder.yml` then.
