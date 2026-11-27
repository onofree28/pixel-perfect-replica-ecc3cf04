# Lovable Chat Assistant Desktop

This desktop app is separate from the Chrome extension. It connects to GitHub with the device login, lists repositories, can create a private or public repository, and downloads the selected repository to a temporary folder only when the user requests a preview. It installs project dependencies, starts `npm run dev` on loopback, streams server output, and opens the detected local URL in a dedicated preview window.

## Development

Requirements: Windows x64 and Node.js/npm installed. The selected repository must contain a web project with a `package.json` and a `dev` script.

```powershell
cd desktop
npm install
npm start
```

Sign in to GitHub, choose or create a repository, then explicitly start its preview. New repositories can include an editable starter website that is ready to preview. The app runs `npm install` in the temporary copy and executes the project's development scripts. Only preview repositories you trust. Stopping the preview removes its temporary files.

## Build a Windows installer

```powershell
cd desktop
npm run dist
```

The installer is written to `desktop/installer-br/`.

## Current scope

This iteration provides GitHub repository selection and local preview. The conversational AI editing flow still needs to be connected to this desktop shell. The extension remains its own product and does not embed WebContainers.
