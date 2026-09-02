# JS Runner Kit

A VS Code / Cursor extension for running source files and npm scripts in parallel terminals, with sidebar views for npm scripts, active runs, and configurable language interpreters.

## Features

- **Run current file** — Editor title bar play button and F4 when the file's language has a configured interpreter
- **Parallel terminals** — Each run opens its own terminal; Ctrl+F4 runs the same file in a new terminal without stopping others
- **NPM Scripts sidebar** — Scans all `package.json` files (excluding `node_modules`), groups scripts by package, and auto-refreshes when `package.json` changes
- **Debug NPM scripts** — Inline debug button on Node/JS-related scripts (vite, tsx, node, etc.); launches the VS Code JavaScript Debugger with breakpoints when possible
- **Running Scripts sidebar** — Lists active terminals; click to focus or stop individual runs
- **Language Interpreters sidebar** — Lists supported languages and interpreter paths; add, edit, or remove entries

## Installation

Install from a packaged `.vsix`:

```bash
npm run package
npm run install:plugin
```

Or install manually in VS Code / Cursor: **Extensions** → **⋯** → **Install from VSIX…** → select `js-runner-kit-0.0.4.vsix` (also available under `release/`).

## Sidebar views

Open the **JS Runner** activity bar icon to access:

| View | Description |
|------|-------------|
| **NPM Scripts** | Workspace npm scripts grouped by `package.json`; play to run, debug icon for JS-related scripts |
| **Running Scripts** | Terminals currently tracked by the extension; click a row to focus its terminal |
| **Language Interpreters** | Language → interpreter mapping used when running files |

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Run JS File | F4 | Run current file (replaces existing terminal for the same file) |
| Run JS File in New Terminal | Ctrl+F4 | Run current file in a new terminal |
| Stop All Running Scripts | — | Close all tracked terminals |
| Stop Running Script | — | Close one terminal from Running Scripts |
| Focus Running Terminal | — | Focus a terminal from Running Scripts (also triggered by clicking a row) |
| Refresh NPM Scripts | — | Rescan workspace for `package.json` scripts |
| Run NPM Script | — | Run a script from the NPM Scripts sidebar |
| Debug NPM Script | — | Debug a JS-related script from the NPM Scripts sidebar |
| Add Language Interpreter | — | Add a language + interpreter in the sidebar (+ button) |
| Edit Language Interpreter | — | Edit label or path for an existing entry |
| Remove Language Interpreter | — | Remove an interpreter entry |

Shortcuts appear only when the current editor language has a matching interpreter (`jsRunner.canRunCurrentFile`).

## NPM Script Debugging

Scripts whose command references Node/JS tooling (for example `node`, `vite`, `tsx`, `ts-node`, `nodemon`, `next`, `jest`, or a `.js`/`.ts` entry file) show a **debug** inline button in the NPM Scripts sidebar.

When you debug a script, the extension:

1. Parses the npm script command (including simple `cross-env` / `VAR=value` prefixes)
2. Resolves known CLIs via `node_modules/.bin` when possible
3. Launches a **Node** debug session that runs the underlying program directly — so editor breakpoints work
4. Falls back to a **node-terminal** session (`npm run <script>`) when the command cannot be resolved

Requires the built-in **JavaScript Debugger** (bundled with VS Code / Cursor). On failure, an error toast is shown.

## Language Interpreters

When you run a file, the extension looks up the editor's **VS Code language ID** in `jsRunner.interpreters` and executes:

```text
{path} "{absoluteFilePath}"
```

Shell scripts (`shellscript`) use a relative path instead: `{path} "./{fileName}"` from the file's directory.

Example: with `path: "python"`, running `Hello.py` sends `python "C:\path\to\Hello.py"` to the terminal.

### Default interpreters

| languageId | label | path |
|------------|-------|------|
| `shellscript` | Bash | `bash` |
| `java` | Java | `java` |
| `javascript` | JavaScript | `node` |
| `javascriptreact` | JavaScript React | `node` |
| `python` | Python | `python` |
| `typescript` | TypeScript | `node --experimental-strip-types` |
| `html` | HTML | `default browser` |

HTML files open in the **system default browser** via `vscode.env.openExternal` (same as Ctrl+click on a link in the terminal). No terminal command is executed; the `path` value is display-only.

At runtime, the extension scans the local terminal `PATH` for each default language. Interpreters that are found locally are appended automatically; languages without a matching executable are skipped. Existing entries in `jsRunner.interpreters` are kept unchanged. On Windows, when multiple `bash` executables exist, **Git Bash** is preferred over WSL's `System32\bash.exe`.

### Configure via sidebar

1. Open **JS Runner** → **Language Interpreters**
2. Click **+** to add, or use inline edit/remove on each row
3. Fields:
   - **languageId** — VS Code language identifier (required)
   - **label** — Display name in the sidebar (optional)
   - **path** — Interpreter executable or command on `PATH` (required)

### Configure via settings

Add or merge entries in user/workspace `settings.json`:

```json
{
  "jsRunner.interpreters": [
    {
      "languageId": "shellscript",
      "label": "Bash",
      "path": "bash"
    },
    {
      "languageId": "java",
      "label": "Java",
      "path": "java"
    }
  ]
}
```

On Windows, if `bash` is not on `PATH`, use a full path:

```json
"path": "C:\\Program Files\\Git\\bin\\bash.exe"
```

### `languageId` reference

`languageId` is **not a fixed enum inside this extension**. It must match the [VS Code language identifier](https://code.visualstudio.com/docs/languages/identifiers) assigned to the open file (shown in the bottom-right language mode, or via **Developer: Inspect Editor Tokens and Scopes**).

Use the exact string below — file extensions are shown for reference only; matching is by language ID, not by suffix.

#### Built-in defaults (preconfigured)

| languageId | Common extensions | Suggested `path` |
|------------|-------------------|------------------|
| `shellscript` | `.sh`, `.bash` | `bash` |
| `java` | `.java` | `java` |
| `javascript` | `.js`, `.mjs`, `.cjs` | `node` |
| `javascriptreact` | `.jsx` | `node` |
| `typescript` | `.ts` | `node --experimental-strip-types` |
| `python` | `.py`, `.pyw` | `python` or `python3` |
| `html` | `.html`, `.htm` | `default browser` |

#### Common additional identifiers

| languageId | Common extensions | Suggested `path` | Notes |
|------------|-------------------|------------------|-------|
| `typescriptreact` | `.tsx` | `tsx` or `node` | TSX/JSX React files |
| `powershell` | `.ps1` | `powershell` | Windows PowerShell |
| `go` | `.go` | `go run` | Command becomes `go run "file.go"` |
| `ruby` | `.rb` | `ruby` | |
| `php` | `.php` | `php` | |
| `csharp` | `.cs` | `dotnet run` | May need project context |
| `rust` | `.rs` | `rustc` | Compilation workflow; single-file run may need extra setup |
| `lua` | `.lua` | `lua` | |
| `r` | `.r`, `.R` | `Rscript` | |
| `perl` | `.pl`, `.pm` | `perl` | |
| `kotlin` | `.kt`, `.kts` | `kotlin` | |
| `swift` | `.swift` | `swift` | |
| `dart` | `.dart` | `dart` | |

#### Extension-provided language IDs

Language extensions can register their own IDs (for example `vue`, `svelte`). Use **Developer: Inspect Editor Tokens and Scopes** on the file to read the `language:` field, then add that value to **Language Interpreters**.

### Examples

**Shell script (`.sh`)**

```json
{
  "languageId": "shellscript",
  "label": "Bash",
  "path": "bash"
}
```

**TypeScript with tsx**

```json
{
  "languageId": "typescript",
  "label": "TypeScript",
  "path": "tsx"
}
```

## Keybinding note

F4 and Ctrl+F4 override VS Code's default debug shortcuts when the current file has a configured interpreter. Remap them in **Keyboard Shortcuts** if needed.

## Development

```bash
npm install
npm run compile
npm run test          # unit + integration tests
npm run test:unit
npm run test:integration
npm run lint
npm run package       # build js-runner-kit-0.0.4.vsix
npm run install:plugin
```

Press **F4** in this repo to launch the Extension Development Host.

Sample files for manual language testing: `test/language-test/` (`Hello.py`, `Hello.sh`, `Hello.ts`, `Hello.java`, `Hello.html`).

## License

MIT
