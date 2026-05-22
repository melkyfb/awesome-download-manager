---
name: awesome-download-manager-readme-design
description: Design spec for comprehensive all-in-one README.md
metadata:
  type: project
---

# README Design: Awesome Download Manager

## Goal
Create a comprehensive `README.md` that serves as the primary entry point for both end-users and developers.

## Structure (Monolith Approach)

### 1. Header
- Project Name: Awesome Download Manager
- Visuals: Logo/Banner (if available)
- Badges: Build status, Version, License

### 2. Project Overview
- Concise description of the application.
- **Key Features**:
    - Protocol Support: HTTP, HTTPS, FTP.
    - AI Integration: File analysis, mirror search, malware checks.
    - Speed Management: TokenBucket speed limiter.
    - Cross-platform: Desktop (Tauri).
    - Database: SQLite for persistent download tracking.

### 3. User Guide (Installation & Basics)
- **Installation**:
    - Direct link to GitHub Releases.
    - OS-specific installation instructions (Windows, macOS, Linux).
- **Quick Start**:
    - First-run configuration.
    - Adding first download link.

### 4. Usage & Workflows
- How to use core features.
- Screenshot gallery demonstrating UI.
- AI features usage walkthrough.

### 5. Developer Setup
- **Prerequisites**:
    - Node.js & npm.
    - Rust toolchain (cargo, rustc).
    - Tauri CLI dependencies.
- **Getting Started**:
    - `git clone`
    - `npm install`
    - `npm run tauri dev`
- **Testing**:
    - Frontend: `npx vitest`
    - Backend: `cd src-tauri && cargo test`

### 6. Technical Architecture
- **Frontend**: React + Redux Toolkit + MUI + Tailwind.
- **Backend**: Rust + Tauri v2.
- **Data Flow**: `invoke()` calls for actions, event-driven updates via `listen()`.
- **Storage**: SQLite (via `rusqlite`).

### 7. Contributing & Forking
- Forking process.
- Branching strategy.
- PR requirements.
- Local development guidelines.

### 8. License
- Standard license declaration.
