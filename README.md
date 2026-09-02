# JS Runner Kit

**English** | [中文](#中文)

Repository: [https://github.com/li1125435097/js-runner](https://github.com/li1125435097/js-runner)

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

---

## 中文

[English](#js-runner-kit) | **中文**

仓库地址：[https://github.com/li1125435097/js-runner](https://github.com/li1125435097/js-runner)

一款 VS Code / Cursor 扩展，可在并行终端中运行源文件和 npm 脚本，并提供 npm 脚本、运行中任务和语言解释器的侧边栏视图。

## 功能

- **运行当前文件** — 当文件语言已配置解释器时，编辑器标题栏显示运行按钮，快捷键 F4
- **并行终端** — 每次运行独立终端；Ctrl+F4 在新终端运行同一文件，不影响其他终端
- **NPM Scripts 侧边栏** — 扫描工作区所有 `package.json`（排除 `node_modules`），按包分组，`package.json` 变更时自动刷新
- **调试 NPM 脚本** — 对 Node/JS 相关脚本（vite、tsx、node 等）显示行内调试按钮；尽可能以 VS Code JavaScript Debugger 启动并保留断点
- **Running Scripts 侧边栏** — 列出活跃终端；点击聚焦或停止单个运行
- **Language Interpreters 侧边栏** — 列出语言与解释器路径；可添加、编辑或删除

## 安装

从打包的 `.vsix` 安装：

```bash
npm run package
npm run install:plugin
```

或在 VS Code / Cursor 中手动安装：**扩展** → **⋯** → **从 VSIX 安装…** → 选择 `js-runner-kit-0.0.4.vsix`（`release/` 目录下也有）。

## 侧边栏视图

点击活动栏 **JS Runner** 图标：

| 视图 | 说明 |
|------|------|
| **NPM Scripts** | 按 `package.json` 分组的工作区 npm 脚本；播放运行，JS 相关脚本显示调试图标 |
| **Running Scripts** | 扩展追踪的终端；点击行可聚焦对应终端 |
| **Language Interpreters** | 运行文件时使用的语言 → 解释器映射 |

## 命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| Run JS File | F4 | 运行当前文件（替换同文件已有终端） |
| Run JS File in New Terminal | Ctrl+F4 | 在新终端运行当前文件 |
| Stop All Running Scripts | — | 关闭所有追踪的终端 |
| Stop Running Script | — | 从 Running Scripts 关闭单个终端 |
| Focus Running Terminal | — | 聚焦 Running Scripts 中的终端（点击行也会触发） |
| Refresh NPM Scripts | — | 重新扫描工作区 `package.json` 脚本 |
| Run NPM Script | — | 从 NPM Scripts 侧边栏运行脚本 |
| Debug NPM Script | — | 从 NPM Scripts 侧边栏调试 JS 相关脚本 |
| Add Language Interpreter | — | 在侧边栏添加语言与解释器（+ 按钮） |
| Edit Language Interpreter | — | 编辑已有条目的 label 或 path |
| Remove Language Interpreter | — | 删除解释器条目 |

仅当当前编辑器语言有匹配解释器时，快捷键才生效（`jsRunner.canRunCurrentFile`）。

## NPM 脚本调试

命令中包含 Node/JS 工具链（如 `node`、`vite`、`tsx`、`ts-node`、`nodemon`、`next`、`jest`，或以 `.js`/`.ts` 为入口文件）的脚本，会在 NPM Scripts 侧边栏显示 **debug** 行内按钮。

调试时扩展会：

1. 解析 npm 脚本命令（支持简单的 `cross-env` / `VAR=value` 前缀）
2. 尽可能通过 `node_modules/.bin` 解析已知 CLI
3. 启动 **Node** 调试会话，直接运行底层程序 — 编辑器断点可用
4. 无法解析时回退到 **node-terminal** 会话（`npm run <script>`）

需要内置 **JavaScript Debugger**（VS Code / Cursor 自带）。启动失败时会显示错误提示。

## 语言解释器

运行文件时，扩展在 `jsRunner.interpreters` 中查找编辑器的 **VS Code language ID**，并执行：

```text
{path} "{absoluteFilePath}"
```

Shell 脚本（`shellscript`）使用相对路径：`{path} "./{fileName}"`（在文件所在目录）。

示例：`path: "python"` 时，运行 `Hello.py` 会发送 `python "C:\path\to\Hello.py"` 到终端。

### 默认解释器

| languageId | label | path |
|------------|-------|------|
| `shellscript` | Bash | `bash` |
| `java` | Java | `java` |
| `javascript` | JavaScript | `node` |
| `javascriptreact` | JavaScript React | `node` |
| `python` | Python | `python` |
| `typescript` | TypeScript | `node --experimental-strip-types` |
| `html` | HTML | `default browser` |

HTML 文件通过 `vscode.env.openExternal` 在**系统默认浏览器**中打开（与终端中 Ctrl+点击链接相同）。不执行终端命令；`path` 值仅用于显示。

运行时，扩展会扫描本地终端 `PATH` 中的默认可执行文件。找到的解释器会自动追加；未找到的可执行文件对应语言会被跳过。`jsRunner.interpreters` 中已有条目保持不变。Windows 上存在多个 `bash` 时，优先使用 **Git Bash**，而非 WSL 的 `System32\bash.exe`。

### 通过侧边栏配置

1. 打开 **JS Runner** → **Language Interpreters**
2. 点击 **+** 添加，或在每行使用行内编辑/删除
3. 字段：
   - **languageId** — VS Code 语言标识符（必填）
   - **label** — 侧边栏显示名称（可选）
   - **path** — 解释器可执行文件或 `PATH` 中的命令（必填）

### 通过设置配置

在用户/工作区 `settings.json` 中添加或合并条目：

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

Windows 上若 `bash` 不在 `PATH` 中，可使用完整路径：

```json
"path": "C:\\Program Files\\Git\\bin\\bash.exe"
```

### `languageId` 参考

`languageId` **不是本扩展内的固定枚举**。必须与当前文件的 [VS Code 语言标识符](https://code.visualstudio.com/docs/languages/identifiers) 完全一致（右下角语言模式，或通过 **Developer: Inspect Editor Tokens and Scopes** 查看）。

下表扩展名仅供参考；匹配依据是 language ID，而非文件后缀。

#### 内置默认（预配置）

| languageId | 常见扩展名 | 建议 `path` |
|------------|-----------|-------------|
| `shellscript` | `.sh`, `.bash` | `bash` |
| `java` | `.java` | `java` |
| `javascript` | `.js`, `.mjs`, `.cjs` | `node` |
| `javascriptreact` | `.jsx` | `node` |
| `typescript` | `.ts` | `node --experimental-strip-types` |
| `python` | `.py`, `.pyw` | `python` 或 `python3` |
| `html` | `.html`, `.htm` | `default browser` |

#### 常见额外标识符

| languageId | 常见扩展名 | 建议 `path` | 备注 |
|------------|-----------|-------------|------|
| `typescriptreact` | `.tsx` | `tsx` 或 `node` | TSX/JSX React 文件 |
| `powershell` | `.ps1` | `powershell` | Windows PowerShell |
| `go` | `.go` | `go run` | 命令为 `go run "file.go"` |
| `ruby` | `.rb` | `ruby` | |
| `php` | `.php` | `php` | |
| `csharp` | `.cs` | `dotnet run` | 可能需要项目上下文 |
| `rust` | `.rs` | `rustc` | 编译流程；单文件运行可能需要额外配置 |
| `lua` | `.lua` | `lua` | |
| `r` | `.r`, `.R` | `Rscript` | |
| `perl` | `.pl`, `.pm` | `perl` | |
| `kotlin` | `.kt`, `.kts` | `kotlin` | |
| `swift` | `.swift` | `swift` | |
| `dart` | `.dart` | `dart` | |

#### 扩展提供的 language ID

语言扩展可注册自己的 ID（如 `vue`、`svelte`）。对文件使用 **Developer: Inspect Editor Tokens and Scopes** 查看 `language:` 字段，再添加到 **Language Interpreters**。

### 示例

**Shell 脚本（`.sh`）**

```json
{
  "languageId": "shellscript",
  "label": "Bash",
  "path": "bash"
}
```

**使用 tsx 运行 TypeScript**

```json
{
  "languageId": "typescript",
  "label": "TypeScript",
  "path": "tsx"
}
```

## 快捷键说明

当当前文件已配置解释器时，F4 和 Ctrl+F4 会覆盖 VS Code 默认调试快捷键。可在 **键盘快捷方式** 中重新映射。

## 开发

```bash
npm install
npm run compile
npm run test          # 单元 + 集成测试
npm run test:unit
npm run test:integration
npm run lint
npm run package       # 构建 js-runner-kit-0.0.4.vsix
npm run install:plugin
```

在本仓库中按 **F4** 可启动 Extension Development Host。

手动语言测试样例：`test/language-test/`（`Hello.py`、`Hello.sh`、`Hello.ts`、`Hello.java`、`Hello.html`）。

## 许可证

MIT
