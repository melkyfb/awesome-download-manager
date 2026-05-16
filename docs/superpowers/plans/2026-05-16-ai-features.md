# Awesome Download Manager — AI Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisite:** Plan 1 (`2026-05-16-core-download-manager.md`) must be complete and all tests passing before starting this plan.

**Goal:** Add optional AI-powered features to the download manager: file analysis + malware check before download, hybrid mirror search, and VirusTotal integration. All features are gated behind a configured API key — the app remains fully functional without AI.

**Architecture:** New Rust modules `ai/provider.rs`, `ai/analysis.rs`, `ai/mirrors.rs`, `ai/commands.rs` added to the existing Tauri backend. Frontend gets new Redux `aiSlice`, updated `DownloadCardExpanded` with live AI results, and an "Analyze First" flow wired in `AddDownloadModal`. AI calls are made from Rust via `reqwest` HTTP — no external AI SDK.

**Tech Stack:** Same as Plan 1 + `serde_json` (already present) for prompt/response handling. No new crates required.

---

## File Map

### New Rust files (`src-tauri/src/ai/`)
| File | Responsibility |
|------|---------------|
| `ai/mod.rs` | Re-exports |
| `ai/provider.rs` | `AiProvider` enum, builds HTTP request body per provider, parses response |
| `ai/analysis.rs` | `analyze_url()` — HEAD request + AI prompt for file type, risk, description |
| `ai/mirrors.rs` | `search_mirrors()` — search API + hardcoded mirrors + AI ranking |
| `ai/commands.rs` | Tauri commands: `analyze_url`, `search_mirrors`, `check_ai_configured` |

### Modified Rust files
| File | Change |
|------|--------|
| `main.rs` | Register new AI commands in `invoke_handler!` |
| `db/repository.rs` | Add `get_ai_cache`, `set_ai_cache` methods |

### New/Modified Frontend files
| File | Change |
|------|--------|
| `store/aiSlice.ts` | New — AI results state per download ID |
| `store/index.ts` | Add `ai` reducer |
| `hooks/useTauriEvents.ts` | Add `ai:result` and `ai:error` listeners |
| `components/DownloadCardExpanded.tsx` | Wire AI buttons to invoke commands, show results |
| `components/AddDownloadModal.tsx` | Enable "Analyze First" button, show analysis dialog |

---

## Task 1: AI Cache in Repository

**Files:**
- Modify: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `src-tauri/src/db/repository.rs` (inside the `tests` module):

```rust
#[test]
fn ai_cache_get_set() {
    let conn = Connection::open_in_memory().unwrap();
    crate::db::schema::run_migrations(&conn).unwrap();
    let repo = Repository::new(&conn);
    let result_json = r#"{"file_type":"ISO","risk_level":"low"}"#;
    assert!(repo.get_ai_cache("hash-abc").unwrap().is_none());
    repo.set_ai_cache("hash-abc", result_json).unwrap();
    let cached = repo.get_ai_cache("hash-abc").unwrap().unwrap();
    assert_eq!(cached, result_json);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test db::repository::tests::ai_cache_get_set
```

Expected: FAIL — methods not found.

- [ ] **Step 3: Implement the cache methods**

Add to the `impl Repository` block in `src-tauri/src/db/repository.rs`:

```rust
pub fn get_ai_cache(&self, url_hash: &str) -> rusqlite::Result<Option<String>> {
    let mut stmt = self.conn.prepare(
        "SELECT result_json FROM ai_cache WHERE url_hash = ?1"
    )?;
    let mut rows = stmt.query(rusqlite::params![url_hash])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_ai_cache(&self, url_hash: &str, result_json: &str) -> rusqlite::Result<()> {
    self.conn.execute(
        "INSERT INTO ai_cache (url_hash, result_json, created_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(url_hash) DO UPDATE SET result_json = ?2, created_at = datetime('now')",
        rusqlite::params![url_hash, result_json],
    )?;
    Ok(())
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src-tauri && cargo test db::repository::tests::ai_cache_get_set
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add src-tauri/src/db/repository.rs
git commit -m "feat: AI cache methods in repository"
```

---

## Task 2: AI Provider Module

**Files:**
- Create: `src-tauri/src/ai/mod.rs`
- Create: `src-tauri/src/ai/provider.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create ai module directory**

```bash
mkdir -p src-tauri/src/ai
```

- [ ] **Step 2: Write failing tests**

Create `src-tauri/src/ai/provider.rs`:

```rust
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq)]
pub enum AiProvider {
    Claude,
    OpenAI,
    OpenAICompatible { endpoint: String },
}

impl AiProvider {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(Self::Claude),
            "openai" => Some(Self::OpenAI),
            other if other.starts_with("openai-compatible:") => {
                let endpoint = other.trim_start_matches("openai-compatible:").to_string();
                Some(Self::OpenAICompatible { endpoint })
            }
            _ => None,
        }
    }

    pub fn endpoint(&self) -> &str {
        match self {
            Self::Claude => "https://api.anthropic.com/v1/messages",
            Self::OpenAI => "https://api.openai.com/v1/chat/completions",
            Self::OpenAICompatible { endpoint } => endpoint.as_str(),
        }
    }

    /// Build the HTTP request body JSON for a given prompt.
    pub fn build_request_body(&self, system: &str, user: &str) -> Value {
        match self {
            Self::Claude => json!({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "system": system,
                "messages": [{ "role": "user", "content": user }]
            }),
            Self::OpenAI | Self::OpenAICompatible { .. } => json!({
                "model": "gpt-4o-mini",
                "max_tokens": 1024,
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user }
                ]
            }),
        }
    }

    /// Extract the text content from the API response JSON.
    pub fn extract_text(&self, response: &Value) -> Option<String> {
        match self {
            Self::Claude => response["content"][0]["text"].as_str().map(String::from),
            Self::OpenAI | Self::OpenAICompatible { .. } => {
                response["choices"][0]["message"]["content"].as_str().map(String::from)
            }
        }
    }

    /// Build auth headers for reqwest.
    pub fn auth_header_name(&self) -> &'static str {
        match self {
            Self::Claude => "x-api-key",
            Self::OpenAI | Self::OpenAICompatible { .. } => "Authorization",
        }
    }

    pub fn auth_header_value(&self, api_key: &str) -> String {
        match self {
            Self::Claude => api_key.to_string(),
            Self::OpenAI | Self::OpenAICompatible { .. } => format!("Bearer {api_key}"),
        }
    }

    /// Extra headers required by this provider.
    pub fn extra_headers(&self) -> Vec<(&'static str, &'static str)> {
        match self {
            Self::Claude => vec![
                ("anthropic-version", "2023-06-01"),
                ("content-type", "application/json"),
            ],
            _ => vec![("content-type", "application/json")],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_str_claude() {
        assert_eq!(AiProvider::from_str("claude"), Some(AiProvider::Claude));
    }

    #[test]
    fn from_str_openai() {
        assert_eq!(AiProvider::from_str("openai"), Some(AiProvider::OpenAI));
    }

    #[test]
    fn from_str_unknown() {
        assert_eq!(AiProvider::from_str("unknown"), None);
    }

    #[test]
    fn claude_request_body_has_system_field() {
        let body = AiProvider::Claude.build_request_body("sys", "user msg");
        assert_eq!(body["system"], "sys");
        assert_eq!(body["messages"][0]["content"], "user msg");
    }

    #[test]
    fn openai_request_body_has_messages_array() {
        let body = AiProvider::OpenAI.build_request_body("sys", "user msg");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "sys");
        assert_eq!(body["messages"][1]["content"], "user msg");
    }

    #[test]
    fn extract_text_claude() {
        let resp = json!({ "content": [{ "type": "text", "text": "hello" }] });
        assert_eq!(AiProvider::Claude.extract_text(&resp), Some("hello".into()));
    }

    #[test]
    fn extract_text_openai() {
        let resp = json!({ "choices": [{ "message": { "content": "world" } }] });
        assert_eq!(AiProvider::OpenAI.extract_text(&resp), Some("world".into()));
    }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd src-tauri && cargo test ai::provider::tests
```

Expected: 7 tests pass.

- [ ] **Step 4: Create `src-tauri/src/ai/mod.rs`**

```rust
pub mod provider;
pub mod analysis;
pub mod mirrors;
pub mod commands;
```

- [ ] **Step 5: Add `pub mod ai;` to `src-tauri/src/lib.rs`**

Open `src-tauri/src/lib.rs` and add `pub mod ai;` alongside the other module declarations.

- [ ] **Step 6: Commit**

```bash
cd ..
git add src-tauri/src/ai/
git commit -m "feat: AI provider module with multi-provider support"
```

---

## Task 3: File Analysis and Malware Check

**Files:**
- Create: `src-tauri/src/ai/analysis.rs`

- [ ] **Step 1: Write the analysis module**

Create `src-tauri/src/ai/analysis.rs`:

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Sha256, Digest};
use crate::ai::provider::AiProvider;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub file_type: String,
    pub description: String,
    pub risk_level: String,       // "low" | "medium" | "high"
    pub risk_explanation: String,
}

fn url_hash(url: &str) -> String {
    format!("{:x}", Sha256::digest(url.as_bytes()))
}

/// Fetch headers from `url` without downloading the body.
async fn fetch_head_info(client: &reqwest::Client, url: &str) -> (Option<String>, Option<String>, Option<u64>) {
    let Ok(resp) = client.head(url).send().await else {
        return (None, None, None);
    };
    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let content_disposition = resp.headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let content_length = resp.headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok());
    (content_type, content_disposition, content_length)
}

/// Call the AI API with the given provider, key, system prompt, and user message.
/// Returns the raw text response.
pub async fn call_ai(
    client: &reqwest::Client,
    provider: &AiProvider,
    api_key: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    let body = provider.build_request_body(system, user);
    let mut req = client.post(provider.endpoint())
        .header(provider.auth_header_name(), provider.auth_header_value(api_key));
    for (k, v) in provider.extra_headers() {
        req = req.header(k, v);
    }
    let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    provider.extract_text(&json).ok_or_else(|| format!("Unexpected response: {json}"))
}

/// Parse the AI text response into an AnalysisResult.
/// Expected format (AI is prompted to return this):
/// FILE_TYPE: <type>
/// DESCRIPTION: <desc>
/// RISK_LEVEL: low|medium|high
/// RISK_EXPLANATION: <explanation>
fn parse_analysis(text: &str) -> AnalysisResult {
    let mut file_type = "Unknown".to_string();
    let mut description = String::new();
    let mut risk_level = "low".to_string();
    let mut risk_explanation = String::new();

    for line in text.lines() {
        if let Some(v) = line.strip_prefix("FILE_TYPE:") {
            file_type = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("DESCRIPTION:") {
            description = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("RISK_LEVEL:") {
            let level = v.trim().to_lowercase();
            if ["low", "medium", "high"].contains(&level.as_str()) {
                risk_level = level;
            }
        } else if let Some(v) = line.strip_prefix("RISK_EXPLANATION:") {
            risk_explanation = v.trim().to_string();
        }
    }

    AnalysisResult { file_type, description, risk_level, risk_explanation }
}

pub async fn analyze_url(
    client: &reqwest::Client,
    provider: &AiProvider,
    api_key: &str,
    url: &str,
) -> Result<AnalysisResult, String> {
    let (content_type, content_disposition, size) = fetch_head_info(client, url).await;
    let filename = url.split('/').last().unwrap_or("unknown").split('?').next().unwrap_or("unknown");

    let system = "You are a file safety analysis assistant. Given a download URL and its HTTP metadata, \
        analyze what kind of file it is and assess its potential risk. \
        Respond ONLY in this exact format (no other text):\n\
        FILE_TYPE: <brief type, e.g. 'Linux ISO installation image'>\n\
        DESCRIPTION: <1-2 sentence description of what this file likely is>\n\
        RISK_LEVEL: low|medium|high\n\
        RISK_EXPLANATION: <brief explanation of the risk assessment>";

    let user = format!(
        "URL: {url}\nFilename: {filename}\nContent-Type: {ct}\nContent-Disposition: {cd}\nSize: {sz}",
        ct = content_type.as_deref().unwrap_or("unknown"),
        cd = content_disposition.as_deref().unwrap_or("none"),
        sz = size.map(|s| format!("{s} bytes")).unwrap_or_else(|| "unknown".into()),
    );

    let text = call_ai(client, provider, api_key, system, &user).await?;
    Ok(parse_analysis(&text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_analysis_full_response() {
        let text = "FILE_TYPE: ZIP archive\nDESCRIPTION: A compressed archive.\nRISK_LEVEL: low\nRISK_EXPLANATION: Common archive format.";
        let result = parse_analysis(text);
        assert_eq!(result.file_type, "ZIP archive");
        assert_eq!(result.risk_level, "low");
        assert_eq!(result.description, "A compressed archive.");
    }

    #[test]
    fn parse_analysis_invalid_risk_defaults_to_low() {
        let text = "FILE_TYPE: X\nDESCRIPTION: Y\nRISK_LEVEL: unknown\nRISK_EXPLANATION: Z";
        let result = parse_analysis(text);
        assert_eq!(result.risk_level, "low");
    }

    #[test]
    fn url_hash_is_deterministic() {
        let h1 = url_hash("https://example.com/file.zip");
        let h2 = url_hash("https://example.com/file.zip");
        assert_eq!(h1, h2);
        assert_ne!(h1, url_hash("https://example.com/other.zip"));
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test ai::analysis::tests
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add src-tauri/src/ai/analysis.rs
git commit -m "feat: AI file analysis and malware check with response parser"
```

---

## Task 4: Mirror Search Module

**Files:**
- Create: `src-tauri/src/ai/mirrors.rs`

- [ ] **Step 1: Write the mirrors module**

Create `src-tauri/src/ai/mirrors.rs`:

```rust
use serde::{Deserialize, Serialize};
use crate::ai::analysis::call_ai;
use crate::ai::provider::AiProvider;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mirror {
    pub url: String,
    pub source: String, // "search" | "known"
    pub confidence: f32,
}

/// Known mirror CDNs/repositories to probe when searching for a file.
const KNOWN_MIRROR_PATTERNS: &[(&str, &str)] = &[
    ("kernel.org", "https://cdn.kernel.org/pub/"),
    ("sourceforge", "https://downloads.sourceforge.net/"),
    ("github-releases", "https://github.com/"),
    ("ubuntu-releases", "https://releases.ubuntu.com/"),
    ("debian", "https://cdimage.debian.org/"),
    ("archlinux", "https://mirror.rackspace.com/archlinux/"),
];

/// Use the search API to find mirrors for `filename`.
async fn search_api_mirrors(
    client: &reqwest::Client,
    search_provider: &str,
    search_api_key: &str,
    filename: &str,
) -> Vec<String> {
    let query = format!("download {filename} mirror site:sourceforge.net OR site:github.com OR site:kernel.org");
    let url = match search_provider {
        "brave" => format!(
            "https://api.search.brave.com/res/v1/web/search?q={}&count=5",
            urlencoding::encode(&query)
        ),
        "serpapi" => format!(
            "https://serpapi.com/search.json?q={}&api_key={}",
            urlencoding::encode(&query), search_api_key
        ),
        _ => return vec![],
    };

    let mut req = client.get(&url);
    if search_provider == "brave" {
        req = req.header("Accept", "application/json")
                 .header("X-Subscription-Token", search_api_key);
    }

    let Ok(resp) = req.send().await else { return vec![]; };
    let Ok(json) = resp.json::<serde_json::Value>().await else { return vec![]; };

    // Extract URLs from Brave or SerpAPI response
    let results = if search_provider == "brave" {
        json["web"]["results"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|r| r["url"].as_str().map(String::from)).collect())
            .unwrap_or_default()
    } else {
        json["organic_results"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|r| r["link"].as_str().map(String::from)).collect())
            .unwrap_or_default()
    };

    results
}

/// Use AI to rank and filter a list of candidate URLs for a given filename.
async fn rank_mirrors_with_ai(
    client: &reqwest::Client,
    provider: &AiProvider,
    api_key: &str,
    filename: &str,
    candidates: &[String],
) -> Vec<Mirror> {
    if candidates.is_empty() {
        return vec![];
    }

    let system = "You are a download mirror ranking assistant. Given a filename and a list of candidate URLs, \
        identify which ones are likely direct download links for that file, ranked by reliability and trustworthiness. \
        Respond with one URL per line, prefixed with a confidence score (0.0 to 1.0), like:\n\
        0.95 https://...\n\
        0.80 https://...\n\
        Only include URLs you are reasonably confident host the file. Omit irrelevant URLs entirely.";

    let candidates_text = candidates.join("\n");
    let user = format!("Filename: {filename}\n\nCandidate URLs:\n{candidates_text}");

    let Ok(text) = call_ai(client, provider, api_key, system, &user).await else {
        // Fallback: return all candidates with equal confidence
        return candidates.iter().map(|u| Mirror {
            url: u.clone(), source: "search".into(), confidence: 0.5,
        }).collect();
    };

    text.lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.trim().splitn(2, ' ').collect();
            if parts.len() == 2 {
                let confidence: f32 = parts[0].parse().unwrap_or(0.5);
                Some(Mirror { url: parts[1].to_string(), source: "search".into(), confidence })
            } else {
                None
            }
        })
        .collect()
}

pub async fn search_mirrors(
    client: &reqwest::Client,
    provider: &AiProvider,
    api_key: &str,
    search_provider: &str,
    search_api_key: &str,
    original_url: &str,
) -> Vec<Mirror> {
    let filename = original_url
        .split('/').last()
        .and_then(|s| s.split('?').next())
        .unwrap_or("unknown");

    // 1. Search API results
    let search_results = search_api_mirrors(client, search_provider, search_api_key, filename).await;

    // 2. Known mirror pattern matches (check if filename could plausibly be on these hosts)
    let known_matches: Vec<String> = KNOWN_MIRROR_PATTERNS.iter()
        .filter(|(key, _)| original_url.contains(key) || filename.contains(key))
        .map(|(_, base)| format!("{base}{filename}"))
        .collect();

    // 3. Combine all candidates (deduplicated)
    let mut all_candidates: Vec<String> = search_results;
    for url in known_matches {
        if !all_candidates.contains(&url) {
            all_candidates.push(url);
        }
    }

    // 4. AI ranks them
    let mut ranked = rank_mirrors_with_ai(client, provider, api_key, filename, &all_candidates).await;

    // Sort by confidence descending
    ranked.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    ranked.truncate(5); // Return top 5
    ranked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_mirror_pattern_extracts_filename() {
        let url = "https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso";
        let filename = url.split('/').last().unwrap().split('?').next().unwrap();
        assert_eq!(filename, "ubuntu-24.04-desktop-amd64.iso");
    }
}
```

Add `urlencoding` to `src-tauri/Cargo.toml`:

```toml
urlencoding = "2"
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test ai::mirrors::tests
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
cd ..
git add src-tauri/src/ai/mirrors.rs src-tauri/Cargo.toml
git commit -m "feat: hybrid mirror search with AI ranking"
```

---

## Task 5: AI Tauri Commands

**Files:**
- Create: `src-tauri/src/ai/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write AI commands**

Create `src-tauri/src/ai/commands.rs`:

```rust
use tauri::{AppHandle, Emitter, State};
use crate::AppState;
use crate::ai::provider::AiProvider;
use crate::ai::analysis::{AnalysisResult, analyze_url};
use crate::ai::mirrors::{Mirror, search_mirrors};
use crate::config::settings::{get_ai_key, load_settings};
use crate::db::repository::Repository;

fn get_provider_and_key(state: &AppState) -> Result<(AiProvider, String), String> {
    let api_key = get_ai_key().ok_or("No AI API key configured")?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    let settings = load_settings(&repo);
    let provider_str = settings.ai_provider.ok_or("No AI provider configured")?;
    let provider = AiProvider::from_str(&provider_str).ok_or("Unknown AI provider")?;
    Ok((provider, api_key))
}

#[tauri::command]
pub async fn analyze_url_cmd(
    url: String,
    state: State<'_, AppState>,
) -> Result<AnalysisResult, String> {
    let (provider, api_key) = get_provider_and_key(&state)?;

    // Check cache first
    let hash = {
        use sha2::{Sha256, Digest};
        format!("{:x}", Sha256::digest(url.as_bytes()))
    };
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        if let Ok(Some(cached)) = repo.get_ai_cache(&hash) {
            let result: AnalysisResult = serde_json::from_str(&cached).map_err(|e| e.to_string())?;
            return Ok(result);
        }
    }

    let client = reqwest::Client::new();
    let result = analyze_url(&client, &provider, &api_key, &url).await?;

    // Cache the result
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        if let Ok(json) = serde_json::to_string(&result) {
            let _ = repo.set_ai_cache(&hash, &json);
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn search_mirrors_cmd(
    url: String,
    state: State<'_, AppState>,
) -> Result<Vec<Mirror>, String> {
    let (provider, api_key) = get_provider_and_key(&state)?;
    let settings = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        load_settings(&repo)
    };
    let search_provider = settings.search_provider.unwrap_or_default();
    // Search API key stored separately in keyring
    let search_api_key = {
        let entry = keyring::Entry::new("awesome-download-manager", "search_api_key")
            .map_err(|e| e.to_string())?;
        entry.get_password().unwrap_or_default()
    };

    let client = reqwest::Client::new();
    Ok(search_mirrors(&client, &provider, &api_key, &search_provider, &search_api_key, &url).await)
}

#[tauri::command]
pub fn check_ai_configured(state: State<'_, AppState>) -> bool {
    get_ai_key().is_some()
}
```

- [ ] **Step 2: Register commands in `src-tauri/src/main.rs`**

Add to the `invoke_handler!` macro in `main.rs`:

```rust
awesome_download_manager::ai::commands::analyze_url_cmd,
awesome_download_manager::ai::commands::search_mirrors_cmd,
awesome_download_manager::ai::commands::check_ai_configured,
```

- [ ] **Step 3: Build to verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add src-tauri/src/ai/commands.rs src-tauri/src/main.rs
git commit -m "feat: AI Tauri commands for analysis and mirror search"
```

---

## Task 6: Frontend AI Slice and Events

**Files:**
- Create: `src/store/aiSlice.ts`
- Modify: `src/store/index.ts`
- Modify: `src/hooks/useTauriEvents.ts`

- [ ] **Step 1: Write failing tests for aiSlice**

Create `src/store/aiSlice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import aiReducer, { setAiLoading, setAiResult, setAiError, setMirrors } from './aiSlice'

describe('aiSlice', () => {
  it('sets loading state', () => {
    const state = aiReducer(undefined, setAiLoading({ id: 'dl-1', loading: true }))
    expect(state.loading['dl-1']).toBe(true)
  })

  it('sets AI result', () => {
    const result = {
      file_type: 'ISO', description: 'Linux image',
      risk_level: 'low' as const, risk_explanation: 'Safe',
    }
    const state = aiReducer(undefined, setAiResult({ id: 'dl-1', result }))
    expect(state.results['dl-1']).toEqual(result)
    expect(state.loading['dl-1']).toBe(false)
  })

  it('sets error', () => {
    const state = aiReducer(undefined, setAiError({ id: 'dl-1', error: 'Failed' }))
    expect(state.errors['dl-1']).toBe('Failed')
    expect(state.loading['dl-1']).toBe(false)
  })

  it('sets mirrors', () => {
    const mirrors = [{ url: 'https://example.com/file.iso', source: 'known', confidence: 0.9 }]
    const state = aiReducer(undefined, setMirrors({ id: 'dl-1', mirrors }))
    expect(state.mirrors['dl-1']).toEqual(mirrors)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/store/aiSlice.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement aiSlice**

Create `src/store/aiSlice.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { AiResult, MirrorResult } from '../types'

interface AiState {
  results: Record<string, AiResult>
  mirrors: Record<string, MirrorResult[]>
  loading: Record<string, boolean>
  errors: Record<string, string>
}

const initialState: AiState = { results: {}, mirrors: {}, loading: {}, errors: {} }

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    setAiLoading(state, action: PayloadAction<{ id: string; loading: boolean }>) {
      state.loading[action.payload.id] = action.payload.loading
    },
    setAiResult(state, action: PayloadAction<{ id: string; result: AiResult }>) {
      state.results[action.payload.id] = action.payload.result
      state.loading[action.payload.id] = false
      delete state.errors[action.payload.id]
    },
    setAiError(state, action: PayloadAction<{ id: string; error: string }>) {
      state.errors[action.payload.id] = action.payload.error
      state.loading[action.payload.id] = false
    },
    setMirrors(state, action: PayloadAction<{ id: string; mirrors: MirrorResult[] }>) {
      state.mirrors[action.payload.id] = action.payload.mirrors
      state.loading[`mirrors-${action.payload.id}`] = false
    },
  },
})

export const { setAiLoading, setAiResult, setAiError, setMirrors } = aiSlice.actions
export default aiSlice.reducer
```

- [ ] **Step 4: Add `ai` reducer to store**

Open `src/store/index.ts` and add:

```typescript
import aiReducer from './aiSlice'
// In configureStore:
reducer: {
  downloads: downloadsReducer,
  config: configReducer,
  ui: uiReducer,
  ai: aiReducer,        // ← add this line
},
```

Also update `RootState` type — it updates automatically since it's derived from `store.getState`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/store/aiSlice.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/aiSlice.ts src/store/aiSlice.test.ts src/store/index.ts
git commit -m "feat: AI Redux slice with tests"
```

---

## Task 7: Wire AI Buttons in DownloadCardExpanded

**Files:**
- Modify: `src/components/DownloadCardExpanded.tsx`

- [ ] **Step 1: Replace DownloadCardExpanded with wired version**

Replace the entire contents of `src/components/DownloadCardExpanded.tsx`:

```tsx
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from '../store'
import { setAiLoading, setAiResult, setAiError, setMirrors } from '../store/aiSlice'
import type { Download } from '../types'

function AiButton({
  label, disabled, loading, onClick,
}: {
  label: string
  disabled: boolean
  loading?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={disabled || loading}
      onClick={onClick}
      title={disabled ? 'Configure uma API key de IA nas Configurações para usar esta função' : undefined}
      className={`
        text-xs px-3 py-1 rounded border flex items-center gap-1 transition-opacity
        ${disabled || loading
          ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 cursor-pointer'
        }
      `}
    >
      {loading ? '⏳ Loading…' : label}
      {disabled && !loading && <span className="text-amber-500 font-bold">!</span>}
    </button>
  )
}

export function DownloadCardExpanded({ download }: { download: Download }) {
  const dispatch = useDispatch<AppDispatch>()
  const aiEnabled = useSelector((s: RootState) => s.config.ai_enabled)
  const aiResult = useSelector((s: RootState) => s.ai.results[download.id])
  const mirrors = useSelector((s: RootState) => s.ai.mirrors[download.id])
  const aiError = useSelector((s: RootState) => s.ai.errors[download.id])
  const loadingAnalysis = useSelector((s: RootState) => !!s.ai.loading[download.id])
  const loadingMirrors = useSelector((s: RootState) => !!s.ai.loading[`mirrors-${download.id}`])

  async function runAnalysis() {
    dispatch(setAiLoading({ id: download.id, loading: true }))
    try {
      const result = await invoke<{ file_type: string; description: string; risk_level: string; risk_explanation: string }>(
        'analyze_url_cmd', { url: download.url }
      )
      dispatch(setAiResult({ id: download.id, result: { ...result, risk_level: result.risk_level as 'low' | 'medium' | 'high' } }))
    } catch (e) {
      dispatch(setAiError({ id: download.id, error: String(e) }))
    }
  }

  async function runMirrorSearch() {
    dispatch(setAiLoading({ id: `mirrors-${download.id}`, loading: true }))
    try {
      const results = await invoke<{ url: string; source: string; confidence: number }[]>(
        'search_mirrors_cmd', { url: download.url }
      )
      dispatch(setMirrors({ id: download.id, mirrors: results.map(r => ({ ...r, confidence: r.confidence })) }))
    } catch (e) {
      dispatch(setAiError({ id: download.id, error: String(e) }))
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  const riskColors: Record<string, string> = {
    low: 'text-green-700 bg-green-50 border-green-300',
    medium: 'text-amber-700 bg-amber-50 border-amber-300',
    high: 'text-red-700 bg-red-50 border-red-400',
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
      {/* SHA256 */}
      {download.sha256 && (
        <div className="mb-3">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">SHA256</span>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 truncate max-w-xs">
              {download.sha256}
            </code>
            <button onClick={() => copyToClipboard(download.sha256!)} className="text-xs text-blue-600 hover:text-blue-800">Copy</button>
            <a
              href={`https://www.virustotal.com/gui/file/${download.sha256}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              VirusTotal →
            </a>
          </div>
        </div>
      )}

      {/* AI Actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <AiButton
          label="🤖 AI Summary"
          disabled={!aiEnabled}
          loading={loadingAnalysis}
          onClick={runAnalysis}
        />
        <AiButton
          label="🛡 Check Malware"
          disabled={!aiEnabled}
          loading={loadingAnalysis}
          onClick={runAnalysis}
        />
        <AiButton
          label="🔗 Find Mirrors"
          disabled={!aiEnabled}
          loading={loadingMirrors}
          onClick={runMirrorSearch}
        />
      </div>

      {/* AI Gate Banner */}
      {!aiEnabled && (
        <div className="flex items-center gap-2 bg-amber-50 border-l-4 border-amber-400 rounded px-3 py-2 text-xs text-amber-800 mb-2">
          <span className="font-bold">!</span>
          <span>Funções de IA desativadas. <button className="underline text-blue-600">Configurar →</button></span>
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">
          ⚠ {aiError}
        </div>
      )}

      {/* AI Analysis Result */}
      {aiResult && (
        <div className={`border rounded px-3 py-2 mb-2 text-xs ${riskColors[aiResult.risk_level] ?? riskColors.low}`}>
          <div className="font-medium mb-1">
            {aiResult.risk_level === 'high' ? '🚨' : aiResult.risk_level === 'medium' ? '⚠' : '✅'}{' '}
            {aiResult.risk_level.toUpperCase()} RISK — {aiResult.file_type}
          </div>
          <p className="text-gray-700 mb-1">{aiResult.description}</p>
          <p className="italic">{aiResult.risk_explanation}</p>
        </div>
      )}

      {/* High Risk Confirmation Banner */}
      {aiResult?.risk_level === 'high' && (
        <div className="bg-red-100 border border-red-400 rounded px-3 py-2 text-xs text-red-800 mb-2">
          <strong>⚠ Este arquivo pode ser perigoso.</strong> Verifique o VirusTotal antes de executar.
        </div>
      )}

      {/* Mirrors */}
      {mirrors && mirrors.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Mirrors encontrados</p>
          <ul className="space-y-1">
            {mirrors.map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">{Math.round(m.confidence * 100)}%</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-sm">
                  {m.url}
                </a>
                <span className="text-gray-400 shrink-0">({m.source})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 text-xs text-gray-400 truncate">{download.url}</div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DownloadCardExpanded.tsx
git commit -m "feat: DownloadCardExpanded wired to AI analysis and mirror search"
```

---

## Task 8: Enable "Analyze First" Flow in AddDownloadModal

**Files:**
- Modify: `src/components/AddDownloadModal.tsx`

- [ ] **Step 1: Update AddDownloadModal to enable Analyze First**

Replace the entire contents of `src/components/AddDownloadModal.tsx`:

```tsx
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../store'
import { closeAddModal } from '../store/uiSlice'
import { upsertDownload } from '../store/downloadsSlice'
import { setAiResult } from '../store/aiSlice'
import type { AiResult, Download } from '../types'
import { openSettings } from '../store/uiSlice'

type Step = 'input' | 'analyzing' | 'analyzed' | 'downloading'

export function AddDownloadModal() {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [url, setUrl] = useState('')
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [step, setStep] = useState<Step>('input')
  const [analysisResult, setAnalysisResult] = useState<AiResult | null>(null)
  const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(null)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload(skipToId?: string) {
    if (!url.trim()) return
    setStep('downloading')
    try {
      const id = await invoke<string>('start_download', {
        url: url.trim(), destFolder, chunks: config.chunks,
      })
      const dl: Download = {
        id, url: url.trim(),
        filename: url.split('/').pop()?.split('?')[0] ?? 'download',
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0,
        status: 'active', sha256: null, chunks_json: null,
        created_at: new Date().toISOString(), completed_at: null,
      }
      dispatch(upsertDownload(dl))
      if (analysisResult) dispatch(setAiResult({ id, result: analysisResult }))
      dispatch(closeAddModal())
    } catch {
      setStep(analysisResult ? 'analyzed' : 'input')
    }
  }

  async function analyzeFirst() {
    if (!url.trim()) return
    setStep('analyzing')
    try {
      const result = await invoke<AiResult>('analyze_url_cmd', { url: url.trim() })
      setAnalysisResult(result)
      setStep('analyzed')
    } catch (e) {
      setStep('input')
      alert(`Analysis failed: ${e}`)
    }
  }

  const riskColors: Record<string, string> = {
    low: 'border-green-400 bg-green-50 text-green-800',
    medium: 'border-amber-400 bg-amber-50 text-amber-800',
    high: 'border-red-500 bg-red-50 text-red-800',
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New Download</h2>

        {/* URL Input */}
        <label className="block text-sm text-gray-600 mb-1">URL</label>
        <input
          type="url" value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={step === 'analyzing' || step === 'downloading'}
          placeholder="https://example.com/file.zip"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          autoFocus
        />

        {/* Destination Folder */}
        <label className="block text-sm text-gray-600 mb-1">Destination Folder</label>
        <div className="flex gap-2 mb-4">
          <input
            type="text" value={destFolder}
            onChange={(e) => setDestFolder(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={pickFolder} className="px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Browse</button>
        </div>

        {/* Analyzing State */}
        {step === 'analyzing' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <span className="animate-spin">⏳</span> Analyzing with AI…
          </div>
        )}

        {/* Analysis Result */}
        {step === 'analyzed' && analysisResult && (
          <div className={`border-l-4 rounded px-3 py-2 mb-4 text-sm ${riskColors[analysisResult.risk_level] ?? riskColors.low}`}>
            <p className="font-medium mb-1">
              {analysisResult.risk_level === 'high' ? '🚨' : analysisResult.risk_level === 'medium' ? '⚠' : '✅'}{' '}
              {analysisResult.risk_level.toUpperCase()} RISK — {analysisResult.file_type}
            </p>
            <p className="text-xs mb-1">{analysisResult.description}</p>
            <p className="text-xs italic">{analysisResult.risk_explanation}</p>

            {analysisResult.risk_level === 'high' && (
              <div className="mt-2 font-semibold text-red-700">
                ⚠ Este arquivo pode ser perigoso. Deseja continuar mesmo assim?
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => startDownload()}
            disabled={step === 'analyzing' || step === 'downloading' || !url.trim()}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 'downloading' ? 'Starting…' : '▶ Download Now'}
          </button>

          {step !== 'analyzed' && (
            <button
              onClick={analyzeFirst}
              disabled={!config.ai_enabled || step === 'analyzing' || step === 'downloading' || !url.trim()}
              title={!config.ai_enabled ? 'Configure uma API key de IA nas Configurações para usar esta função' : undefined}
              className={`flex-1 flex items-center justify-center gap-1 border rounded-lg py-2 text-sm
                ${config.ai_enabled
                  ? 'border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100'
                  : 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              🤖 Analyze First
              {!config.ai_enabled && <span className="text-amber-500 font-bold">!</span>}
            </button>
          )}

          <button
            onClick={() => dispatch(closeAddModal())}
            className="px-4 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>

        {/* AI Gate Banner */}
        {!config.ai_enabled && (
          <p className="text-xs text-amber-700 mt-3 bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded">
            <strong>!</strong> AI analysis not configured.{' '}
            <button
              className="underline text-blue-600"
              onClick={() => { dispatch(closeAddModal()); dispatch(openSettings()) }}
            >
              Configure credentials →
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AddDownloadModal.tsx
git commit -m "feat: AddDownloadModal with Analyze First flow and high-risk confirmation"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: All tests pass (db, download, ai, config modules).

- [ ] **Step 2: Run all frontend tests**

```bash
cd .. && npx vitest run
```

Expected: All tests pass (downloadsSlice, aiSlice).

- [ ] **Step 3: Build and manually test the full AI flow**

```bash
npm run tauri dev
```

Manual test checklist:
1. Open Settings → configure AI provider (Claude or OpenAI) + paste a real API key → click Save
2. Verify AI buttons are now enabled in the "+ New Download" modal
3. Paste a URL (e.g., `https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso`)
4. Click "🤖 Analyze First" — analysis panel should appear with file type, risk level, and description
5. Click "Download Now" — download starts and the existing analysis appears in the card expanded view
6. After download completes: click the card, expand it, click "🔗 Find Mirrors" — list of mirrors should appear
7. Test with a suspicious-looking URL — verify "high risk" warning shows with confirmation message
8. Remove the AI key in Settings — verify buttons return to disabled state with `!` warning

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: AI features complete — analysis, malware check, mirror search"
```

---

## Self-Review Checklist

- [ ] All spec requirements covered:
  - [x] Chunked HTTP download (Plan 1 Task 6)
  - [x] FTP support (Plan 1 Task 6)
  - [x] SHA256 + VirusTotal link (Plan 1 Task 6 + Task 10)
  - [x] Speed limit 0=unlimited (Plan 1 Task 4 + Task 12)
  - [x] AI configurable per provider (Plan 2 Task 2)
  - [x] AI gate — buttons disabled with `!` when not configured (Plan 1 Task 10 + Plan 2 Task 7)
  - [x] File analysis + malware check (Plan 2 Task 3)
  - [x] Mirror search hybrid (Plan 2 Task 4)
  - [x] High-risk confirmation dialog (Plan 2 Task 8)
  - [x] Resume/retry (Plan 1 Task 5 + Task 7)
- [ ] All Rust tests pass
- [ ] All frontend tests pass
- [ ] App builds without errors
