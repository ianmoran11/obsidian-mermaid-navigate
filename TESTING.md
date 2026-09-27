# Verification record

## Automated checks

- `npm run build`: strict TypeScript check and production bundle pass.
- `npm test`: **39 unit tests pass** (geometry, SVG references, exact fence slices, duplicate blocks, CRLF, YAML frontmatter, fence injection, file identity, concurrent edits, stale editor/disk state, and cancellation during unload).
- `npm run test:browser`: **38 Playwright tests pass**, split across desktop Chromium and Pixel 7 touch emulation.
- Browser coverage includes the original navigation/lifecycle checks plus editable code panels, draft-preserving toggles, Save/Cancel, refreshed diagrams, conflict/invalid-code handling, guarded close, pending saves, unavailable source locations, and 320 × 480 code-editor layout.

## v1.1 — Actual desktop Obsidian editing tests

Tested in **Obsidian 1.6.7** using a separate profile and disposable `edit-test-vault`. No personal desktop notes or settings were changed. `npm run test:obsidian` / `scripts/test-desktop-editing.mjs` reports **10 passing checks**:

1. Reading view loads the exact source of the second of two identical diagrams.
2. Toggles retain drafts; Close/Escape protect unsaved edits.
3. Save changes only the chosen block and refreshes fullscreen.
4. Invalid Mermaid cannot modify the note.
5. Concurrent note changes are preserved and the draft remains available.
6. Live Preview maps and edits the correct native code block.
7. Cancel does not save; native Undo reverses the saved range edit.
8. A rendered note embed edits the original source, not its parent note.
9. Live Preview preserves YAML frontmatter containing misleading literal fences.
10. Deferred Show code follows the original file after rename, even when the old path is reused by an identical new note.

Independent review identified and prompted regression fixes for frontmatter/containing-range confusion, deferred file identity, writes after unload, and disk changes that have not reached an editor buffer. Both pre-load and post-load stale-buffer cases have explicit unit coverage. Drafts are deliberately refused when file/editor/rendered snapshots disagree.

Evidence: `artifacts/desktop-editing-results.json`, `artifacts/desktop-code-editor.png`, `artifacts/editing-check.log`, `artifacts/editing-review.md`, and `artifacts/editing-review-final.md`. Save/Cancel screenshots were inspected directly.

**The phone was unplugged for v1.1. Editing was not installed or tested on the physical phone; touch browser emulation is not a substitute for that test.**

## v1.0 — Connected Android navigation tests (previous release)

Tested via authorized USB on an Android device running **Obsidian 1.13.8**, in an explicitly authorized vault with a dedicated sample note. This was the actual installed Obsidian WebView, not a browser mock or Android emulator.

**10 integration checks pass in both portrait and landscape:**

1. Native Reading-view Mermaid diagrams receive controls.
2. Inline zoom-in/out changes scale correctly.
3. Fullscreen fills the app viewport (approximately 412 × 947 CSS pixels portrait, 947 × 412 landscape).
4. One-finger drag translates the diagram.
5. Two-finger pinch doubles the scale at the tested gesture distance.
6. Fit, actual-size, and explicit close work.
7. Native Android Back dismisses fullscreen.
8. Live Preview opens native Mermaid diagrams fullscreen.
9. Disabling removes all plugin UI and reveals native diagrams; re-enabling restores controls.
10. The sample note's Markdown remains byte-for-byte unchanged through interaction.

Touch gestures were injected through Chrome DevTools into the phone's WebView. An additional **native Android `input swipe`** independently verified panning: a requested 60 × 40 CSS-pixel drag produced approximately 59.77 × 39.97 pixels of translation. Native Back was exercised through Android input, too.

Native screenshots were inspected in portrait and landscape, including readable HTML labels, node styling, edges, and arrowheads. A duplicate close control introduced by Obsidian's newer mobile modal markup was hidden, leaving the plugin's accessible close button. Original automatic screen rotation was restored after portrait testing.

### Local evidence (ignored by git)

- `artifacts/phone-results.json`: landscape integration results.
- `artifacts/portrait/results.json`: portrait integration results.
- `artifacts/phone-native-swipe.json`: physical input-path verification.
- `artifacts/phone-*.png` and `artifacts/portrait/*.png`: screenshots.
- `artifacts/review.md`, `artifacts/review-resolution.md`: independent review and fix dispositions.
- `artifacts/phone-before/community-plugins.json`: pre-install plugin-list backup.

## Boundaries

- iOS and desktop pop-out windows have not been device-tested. v1.1 source editing has actual desktop coverage, but no actual Android/iOS soft-keyboard or dirty-Back coverage yet.
- Fullscreen is app-filling, not OS immersive mode. Status/navigation bars remain visible where required by Obsidian/Android.
- Arbitrary theme selectors tied to note ancestors and JavaScript Mermaid callbacks are documented limitations; no new Mermaid parser is bundled.
- During v1.0 testing, only the plugin directory and `Mermaid Navigate - Test.md` were added to the phone vault. Existing notes/plugins were preserved. v1.1 testing made no further phone changes.
- Code editing intentionally refuses indented/nested fences and missing/ambiguous source locations. Navigation continues to work; use the native note editor for those blocks.
- Drafts are memory-only and are discarded on plugin/app reload. Pending validation is cancelled on plugin unload; a write already committed before unload cannot be rolled back.
