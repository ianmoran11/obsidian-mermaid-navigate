# Mermaid Navigate

An Obsidian plugin for **zooming, panning, fullscreen viewing, and editing Mermaid diagrams**. Works with Obsidian's existing renderer in Reading view, Live Preview, and rendered embeds. Mobile-friendly; no network requests or separately bundled Mermaid engine.

## Use

1. Open a note containing a fenced `mermaid` code block.
2. Under the rendered diagram, choose **Pan & zoom** or **Fullscreen**.
3. Drag to pan. Pinch with two fingers or use the mouse wheel/trackpad to zoom.
4. Use **+ / −**, **Fit**, or **1:1**. Close with **✕**; Escape or Android Back also dismisses fullscreen.

The diagram remains static until you activate the viewer, so normal note scrolling still works. Inline **✕** restores the original diagram. Fullscreen uses an Obsidian modal that fills the app, not the browser Fullscreen API; operating-system status/navigation bars may remain visible.

With the diagram area focused: arrow keys pan, Shift+arrow pans farther, `+`/`−` zoom, `0` fits, and `1` restores actual size. Double-click zooms in. There is also a command: **Mermaid Navigate: Open first diagram in active note fullscreen**. This finds the first currently rendered diagram; Obsidian may virtualize diagrams far outside the visible area.

In Live Preview, move the cursor outside the code block to see its rendered diagram. Raw Source mode and malformed Mermaid code cannot be navigated until rendered successfully.

## Edit diagram code (v1.1)

- Choose **Show code** below a diagram or in the inline toolbar. This opens a stable fullscreen code editor, so note re-rendering cannot destroy an unfinished draft.
- In fullscreen, **Show code / Show diagram** switches between the editor and the last saved diagram without discarding your draft.
- Edit the Mermaid text without its surrounding triple-backtick fences.
- **Save** checks the code with Obsidian's Mermaid renderer, replaces only that block's body, and refreshes the displayed diagram. `Ctrl+S` / `Cmd+S` also saves while the code field is focused.
- **Cancel** discards the draft and returns to the saved diagram. Closing/Escape/Back is guarded while there are unsaved edits or a pending save.

The source note's path is displayed above the editor. A diagram inside a rendered note embed edits its original source note, not the embedding note. Live Preview edits use the native editor and retain Undo history.

If the note changes while you edit, Save refuses to overwrite it and leaves your draft available to copy. If there are already unsaved/incoming changes when you first show code, wait for Obsidian to finish saving and reopen the current diagram. No draft is autosaved; save or cancel before disabling the plugin, closing Obsidian, or reloading the app.

Code editing requires a reliably located, **top-level, unindented, closed Mermaid fence**. Nested list/callout/blockquote fences, transient previews, and diagrams with unavailable source locations remain navigable but must be edited in Obsidian's native source editor. The plugin never guesses a source location from SVG labels or diagram order.

## Install with BRAT (desktop or mobile)

1. Install and enable **BRAT** from **Settings → Community plugins → Browse**.
2. Open BRAT's settings and choose **Add beta plugin**.
3. Enter `ianmoran11/obsidian-mermaid-navigate` (or the full [GitHub repository URL](https://github.com/ianmoran11/obsidian-mermaid-navigate)) and add it.
4. Enable **Mermaid Navigate** in Community plugins if it is not enabled automatically.

If you previously installed Mermaid Navigate manually, keep the existing plugin folder and add this same repository to BRAT to manage updates. Use BRAT's update command, then reload Obsidian if the old controls remain. No GitHub token is needed for this public repository unless GitHub rate-limits your requests.

## Install manually

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/ianmoran11/obsidian-mermaid-navigate/releases/latest), then copy them into your vault:

```text
YourVault/.obsidian/plugins/mermaid-navigate/
├── main.js
├── manifest.json
└── styles.css
```

Reload Obsidian, then enable **Mermaid Navigate** under **Settings → Community plugins**. Community plugins must be allowed. The plugin is not yet published in Obsidian's community catalog.

`npm run package` creates both `dist/mermaid-navigate/` and `dist/mermaid-navigate-1.1.0.zip`. Extract the folder into `.obsidian/plugins/` on desktop or mobile. See `examples/Mermaid Navigate - Test.md` for sample diagrams.

To update, replace those three files and reload Obsidian (or disable/re-enable the plugin). Disable or uninstall through Community plugins to remove the viewer. Note contents are changed only by an explicit code **Save**; the plugin does not write a settings file.

## Development

Requires Node.js 20+ and npm.

```sh
npm ci
npm run build          # typecheck + production main.js
npm run dev            # watch mode
npm test               # geometry, SVG, fence targeting, and save-safety tests
npx playwright install chromium
npm run test:browser   # desktop + touch browser regression tests
npm run check          # build + both suites
npm run package        # ready-to-install folder + zip (requires zip)
```

### Design

- Adds controls to rendered `.mermaid` elements; does not replace Obsidian's Mermaid code-block processor or bundle a second Mermaid version.
- A batched MutationObserver handles asynchronous rendering, Live Preview, and re-rendering. Desktop pop-out documents are observed separately.
- An interactive copy receives unique SVG IDs with remapped local references. Obsidian retains ownership of the original SVG; navigation never rewrites note text.
- Editing uses Obsidian postprocessor source metadata or a registered CodeMirror view's exact widget position. It binds the original file identity, checks both file and editor content, validates rendering before saving, and refuses stale/ambiguous targets.
- Saves use the native editor's range replacement and save API when open, or an atomic `Vault.process` otherwise. Disabling the plugin cancels pending validation before it can write.
- Pointer Events implement anchored zoom, two-finger pinch, single-finger pan, and capture cleanup. ResizeObserver refits untouched diagrams and preserves the center after manual navigation.
- Controls have accessible labels, visible focus, and 44px minimum touch targets. Escape/Back and focus handling use Obsidian's Modal lifecycle.
- Disabling the plugin disconnects observers, cancels pending frames, removes viewers, and unhides originals.

### Limitations

Fullscreen copies preserve embedded SVG styles and common `.mermaid`/`.markdown-rendered` theme selectors. Arbitrary styles depending on other note ancestors may differ. Custom JavaScript callbacks attached by Mermaid or another plugin are not copied; ordinary anchor links remain usable. Explicit code saves refresh the fullscreen chart immediately; external changes are reflected when you reopen fullscreen. iOS and desktop Obsidian pop-out windows have not been device-tested; browser tests cover the shared interaction code.

### Desktop Obsidian editing integration tests

`npm run test:obsidian` connects to an **isolated Obsidian test profile** with CDP on `127.0.0.1:9224`. It refuses any vault other than `edit-test-vault`. See `scripts/test-desktop-editing.mjs`; it creates/updates disposable fixtures and checks real Reading-view/Live-Preview saves, Undo, embeds, duplicate blocks, conflicts, frontmatter, and rename/path reuse. It is deliberately separate from `npm run check` because it requires a running desktop app with the current plugin build installed.

The v1.1 editor was tested in desktop Obsidian and touch browser emulation, **not on a physical Android or iOS device**. The previous Android checks cover v1.0 navigation only.

### Android integration testing (development only)

`scripts/phone-cdp.mjs` connects to an already-debuggable Obsidian Android WebView over a local ADB forward. These tools are not bundled in the plugin. USB debugging must be explicitly authorized on the phone.

```sh
adb shell 'cat /proc/net/unix | grep webview_devtools'
adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
# Install the plugin and sample note into the authorized test vault first.
# Set the exact authorized test vault name; the script refuses a mismatch.
TEST_VAULT="Your test vault" node scripts/test-phone.mjs
```

For multi-display/foldable phones, use `adb shell dumpsys SurfaceFlinger --display-id` and set `ANDROID_DISPLAY_ID` to the active panel's ID when running the test. The script changes views in the test note and temporarily disables/re-enables this plugin; it does not edit existing notes. Results and native screenshots go into ignored `artifacts/`.

See [TESTING.md](TESTING.md) for the actual verification record.
