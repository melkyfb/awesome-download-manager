use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Active,
    Paused,
    Complete,
    Error,
    Cancelled,
}

impl std::fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Active => write!(f, "active"),
            Self::Paused => write!(f, "paused"),
            Self::Complete => write!(f, "complete"),
            Self::Error => write!(f, "error"),
            Self::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl TryFrom<String> for DownloadStatus {
    type Error = String;
    fn try_from(s: String) -> std::result::Result<Self, String> {
        match s.as_str() {
            "active" => Ok(Self::Active),
            "paused" => Ok(Self::Paused),
            "complete" => Ok(Self::Complete),
            "error" => Ok(Self::Error),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(format!("Unknown status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub dest_path: String,
    pub total_bytes: Option<i64>,
    pub downloaded_bytes: i64,
    pub status: DownloadStatus,
    pub sha256: Option<String>,
    pub chunks_json: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub struct Repository<'a> {
    conn: &'a Connection,
}

impl<'a> Repository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    // Note: rec.created_at is intentionally ignored — the DB sets it via datetime('now').
    pub fn insert_download(&self, rec: &DownloadRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO downloads (id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            rusqlite::params![
                rec.id, rec.url, rec.filename, rec.dest_path,
                rec.total_bytes, rec.downloaded_bytes,
                rec.status.to_string(), rec.sha256, rec.chunks_json,
            ],
        )?;
        Ok(())
    }

    pub fn update_progress(&self, id: &str, downloaded_bytes: i64, chunks_json: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE downloads SET downloaded_bytes = ?1, chunks_json = ?2 WHERE id = ?3",
            rusqlite::params![downloaded_bytes, chunks_json, id],
        )?;
        Ok(())
    }

    pub fn update_status(&self, id: &str, status: &DownloadStatus) -> Result<()> {
        self.conn.execute(
            "UPDATE downloads SET status = ?1 WHERE id = ?2",
            rusqlite::params![status.to_string(), id],
        )?;
        Ok(())
    }

    pub fn complete_download(&self, id: &str, sha256: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE downloads SET status = 'complete', sha256 = ?1, completed_at = datetime('now'), downloaded_bytes = COALESCE(total_bytes, downloaded_bytes) WHERE id = ?2",
            rusqlite::params![sha256, id],
        )?;
        Ok(())
    }

    pub fn get_download(&self, id: &str) -> Result<Option<DownloadRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at FROM downloads WHERE id = ?1"
        )?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(DownloadRecord {
                id: row.get(0)?,
                url: row.get(1)?,
                filename: row.get(2)?,
                dest_path: row.get(3)?,
                total_bytes: row.get(4)?,
                downloaded_bytes: row.get(5)?,
                status: DownloadStatus::try_from(row.get::<_, String>(6)?).unwrap_or(DownloadStatus::Error),
                sha256: row.get(7)?,
                chunks_json: row.get(8)?,
                created_at: row.get(9)?,
                completed_at: row.get(10)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_downloads(&self) -> Result<Vec<DownloadRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at FROM downloads ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DownloadRecord {
                id: row.get(0)?,
                url: row.get(1)?,
                filename: row.get(2)?,
                dest_path: row.get(3)?,
                total_bytes: row.get(4)?,
                downloaded_bytes: row.get(5)?,
                status: DownloadStatus::try_from(row.get::<_, String>(6)?).unwrap_or(DownloadStatus::Error),
                sha256: row.get(7)?,
                chunks_json: row.get(8)?,
                created_at: row.get(9)?,
                completed_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(rusqlite::params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }

    pub fn get_ai_cache(&self, url_hash: &str) -> Result<Option<String>> {
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

    pub fn set_ai_cache(&self, url_hash: &str, result_json: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO ai_cache (url_hash, result_json, created_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(url_hash) DO UPDATE SET result_json = ?2, created_at = datetime('now')",
            rusqlite::params![url_hash, result_json],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;

    fn make_repo_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    fn sample_record(id: &str) -> DownloadRecord {
        DownloadRecord {
            id: id.to_string(),
            url: format!("https://example.com/{id}.zip"),
            filename: format!("{id}.zip"),
            dest_path: format!("/tmp/{id}.zip"),
            total_bytes: Some(1000),
            downloaded_bytes: 0,
            status: DownloadStatus::Active,
            sha256: None,
            chunks_json: None,
            created_at: String::new(),
            completed_at: None,
        }
    }

    #[test]
    fn insert_and_get_download() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        let rec = sample_record("dl-1");
        repo.insert_download(&rec).unwrap();
        let got = repo.get_download("dl-1").unwrap().unwrap();
        assert_eq!(got.url, "https://example.com/dl-1.zip");
        assert_eq!(got.status, DownloadStatus::Active);
    }

    #[test]
    fn update_progress_and_chunks() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        repo.insert_download(&sample_record("dl-2")).unwrap();
        repo.update_progress("dl-2", 250, Some("[0,1]")).unwrap();
        let got = repo.get_download("dl-2").unwrap().unwrap();
        assert_eq!(got.downloaded_bytes, 250);
        assert_eq!(got.chunks_json.as_deref(), Some("[0,1]"));
    }

    #[test]
    fn complete_download_sets_sha256_and_status() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        repo.insert_download(&sample_record("dl-3")).unwrap();
        repo.complete_download("dl-3", "abc123def").unwrap();
        let got = repo.get_download("dl-3").unwrap().unwrap();
        assert_eq!(got.status, DownloadStatus::Complete);
        assert_eq!(got.sha256.as_deref(), Some("abc123def"));
        assert!(got.completed_at.is_some());
    }

    #[test]
    fn settings_get_set_upsert() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        assert_eq!(repo.get_setting("max_speed").unwrap(), None);
        repo.set_setting("max_speed", "0").unwrap();
        assert_eq!(repo.get_setting("max_speed").unwrap().as_deref(), Some("0"));
        repo.set_setting("max_speed", "1024").unwrap(); // upsert
        assert_eq!(repo.get_setting("max_speed").unwrap().as_deref(), Some("1024"));
    }

    #[test]
    fn list_downloads_returns_all() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        repo.insert_download(&sample_record("a")).unwrap();
        repo.insert_download(&sample_record("b")).unwrap();
        let list = repo.list_downloads().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn ai_cache_get_set() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        assert!(repo.get_ai_cache("hash-abc").unwrap().is_none());
        repo.set_ai_cache("hash-abc", r#"{"risk":"low"}"#).unwrap();
        let cached = repo.get_ai_cache("hash-abc").unwrap().unwrap();
        assert_eq!(cached, r#"{"risk":"low"}"#);
        // upsert
        repo.set_ai_cache("hash-abc", r#"{"risk":"high"}"#).unwrap();
        assert_eq!(repo.get_ai_cache("hash-abc").unwrap().unwrap(), r#"{"risk":"high"}"#);
    }

    #[test]
    fn update_status() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        repo.insert_download(&sample_record("dl-4")).unwrap();
        repo.update_status("dl-4", &DownloadStatus::Paused).unwrap();
        let got = repo.get_download("dl-4").unwrap().unwrap();
        assert_eq!(got.status, DownloadStatus::Paused);
    }
}
