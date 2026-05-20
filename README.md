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
