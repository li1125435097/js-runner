# JS Runner

A JavaScript development assistance plugin for Visual Studio Code.

Run JS files and npm scripts in parallel terminals, with npm scripts grouped by package in the sidebar.

## Features

- **Editor play button** — Run the current JS file from the editor title bar (`editor/title/run`)
- **Parallel terminals** — Each run opens its own terminal; use Ctrl+F5 to run the same file in a new terminal
- **NPM Scripts sidebar** — Scans all `package.json` files (excluding `node_modules`) and groups scripts by package
- **Running Scripts sidebar** — Lists active terminals; focus or stop individual runs

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Run JS File | F5 | Run current file (replaces existing terminal for same file) |
| Run JS File in New Terminal | Ctrl+F5 | Run current file in a new terminal |
| Stop All Running Scripts | — | Close all tracked terminals |
| Refresh NPM Scripts | — | Rescan workspace for package.json scripts |

## Keybinding note

F5 and Ctrl+F5 override VS Code's default debug shortcuts when a JavaScript file is focused. You can remap them in Keyboard Shortcuts if needed.

## Development

```bash
npm install
npm run compile
```

Press **F5** in this repo to launch the Extension Development Host.

## License

MIT
