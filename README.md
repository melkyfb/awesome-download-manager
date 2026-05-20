# 🚀 Awesome Download Manager

[![Build Status](https://github.com/melkyfb/awesome-download-manager/workflows/release-desktop.yml/badge.svg)](https://github.com/melkyfb/awesome-download-manager/actions)
[![Version](https://img.shields.io/github/v/release/melkyfb/awesome-download-manager)](https://github.com/melkyfb/awesome-download-manager/releases)
[![License](https://img.shields.io/github/license/melkyfb/awesome-download-manager)](LICENSE)

**Awesome Download Manager** is a high-performance, cross-platform download manager built with Tauri v2, Rust, and React. It combines the speed and safety of Rust with a modern, intuitive user interface.

### ✨ Key Features
- **Multi-Protocol Support**: Seamlessly download files via HTTP, HTTPS, and FTP.
- **AI-Powered Intelligence**: 
    - 🔍 **Mirror Search**: Automatically find the fastest mirror for your downloads.
    - 📄 **File Analysis**: Get AI-driven insights about files before downloading.
    - 🛡️ **Malware Check**: Integrated security scanning to keep your system safe.
- **Advanced Traffic Control**: Precise speed limiting powered by a TokenBucket algorithm.
- **Persistent Tracking**: Full download history and state management using SQLite.
- **Modern UI**: A clean, responsive interface built with React, Redux Toolkit, and Material UI.

## 📦 User Guide

### Installation
The easiest way to get started is to download the latest release for your operating system.

1. Go to the [Releases Page](https://github.com/melkyfb/awesome-download-manager/releases).
2. Download the installer for your OS:
    - **Windows**: `.msi` or `.exe`
    - **macOS**: `.dmg`
    - **Linux**: `.deb` or `.AppImage`
3. Run the installer and follow the on-screen instructions.

### Quick Start
1. **Launch the App**: Open Awesome Download Manager.
2. **Add a Download**: Click the "+" button or paste a URL into the input field.
3. **Configure**: Set your preferred download folder and global speed limit in the settings.
4. **Manage**: Monitor progress in real-time via the dashboard.

## 🛠 Usage & Workflows

### Core Download Flow
- **Adding Links**: Simply paste a URL. The app automatically detects the protocol and file size.
- **Speed Limiting**: Use the global speed limit slider to prevent the manager from consuming all your bandwidth.
- **Queue Management**: Pause, resume, or prioritize downloads with a single click.

### Leveraging AI Features
- **Mirror Search**: When adding a link, use the AI Mirror Search to find a faster source for the same file.
- **Pre-Download Analysis**: Right-click a pending download to run an AI analysis on the target file's metadata and content.
- **Security Scan**: Every download can be automatically passed through the malware check engine before being marked as complete.

*(Note: AI features must be enabled in the Settings menu to be accessible)*

## 💻 Developer's Corner

### Prerequisites
Ensure you have the following installed:
- [Node.js (LTS)](https://nodejs.org/) & npm
- [Rust Toolchain](https://rustup.rs/) (cargo, rustc)
- [Tauri CLI Dependencies](https://tauri.app/v2/guide/getting-started/prerequisites) (OS-specific build tools)

### Getting Started
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/melkyfb/awesome-download-manager.git
   cd awesome-download-manager
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run in Development Mode**:
   ```bash
   npm run tauri dev
   ```

### Testing
- **Frontend Tests**:
  ```bash
  npx vitest run
  ```
- **Backend Tests**:
  ```bash
  cd src-tauri && cargo test
  ```

## 🏗 Technical Architecture

The project follows a decoupled architecture combining a high-performance Rust backend with a flexible React frontend.

### Stack
- **Frontend**: React 19, Redux Toolkit, Material UI (MUI), Tailwind CSS.
- **Backend**: Rust, Tauri v2.
- **Database**: SQLite (via `rusqlite`) for persistent storage of downloads, AI cache, and settings.

### Communication Bridge
The application uses Tauri's IPC mechanism for communication:
- **Frontend $\to$ Backend**: The frontend invokes Rust commands using `invoke('command_name', { args })`.
- **Backend $\to$ Frontend**: The backend emits asynchronous events (e.g., `download:progress`, `download:complete`) which the frontend listens to via the `useTauriEvents` hook.

### Key Backend Modules
- `download/`: The core engine handling HTTP/FTP streams and the TokenBucket speed limiter.
- `db/`: Handles SQLite schema migrations and CRUD operations.
- `config/`: Manages application settings and secure API key storage via the OS keyring.

## 🤝 Contributing

Contributions are welcome! To contribute:

1. **Fork** the repository.
2. **Create a Feature Branch**: `git checkout -b feature/your-feature-name`.
3. **Commit Changes**: Follow the project's commit style (e.g., `feat: ...`, `fix: ...`).
4. **Open a Pull Request**: Provide a clear description of your changes and how to test them.

### Development Guidelines
- Ensure all frontend tests pass before submitting a PR.
- Rust changes should be verified with `cargo test`.
- Maintain the existing project structure: `src/` for frontend, `src-tauri/` for backend.
