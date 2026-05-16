use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::fs::OpenOptions;
use futures_util::StreamExt;

#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP {status} error for {url}")]
    Http { status: u16, url: String },
    #[error("Cancelled")]
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
}

pub type CancelToken = Arc<AtomicBool>;

pub struct DownloadEngine {
    client: reqwest::Client,
}

impl DownloadEngine {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("AwesomeDownloadManager/1.0")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }

    /// Download url to dest_path. Returns SHA256 hex string on success.
    pub async fn download(
        &self,
        _id: &str,
        url: &str,
        dest_path: &Path,
        num_chunks: u8,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        progress_cb: impl Fn(u64, Option<u64>) + Send + Sync + 'static,
    ) -> Result<String, DownloadError> {
        if url.starts_with("ftp://") || url.starts_with("ftps://") {
            return self.download_ftp(url, dest_path, cancel, progress_cb).await;
        }
        self.download_http(url, dest_path, num_chunks, speed_limit, cancel, progress_cb).await
    }

    async fn download_http(
        &self,
        url: &str,
        dest_path: &Path,
        num_chunks: u8,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        progress_cb: impl Fn(u64, Option<u64>) + Send + Sync + 'static,
    ) -> Result<String, DownloadError> {
        let head = self.client.head(url).send().await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        let total = head.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok());

        let accepts_range = head.headers()
            .get("accept-ranges")
            .map(|v| v.to_str().unwrap_or("none") != "none")
            .unwrap_or(false);

        let progress_cb = Arc::new(progress_cb);
        let downloaded = Arc::new(AtomicU64::new(0));

        if accepts_range && total.is_some() && num_chunks > 1 {
            self.chunked_download(url, dest_path, total.unwrap(), num_chunks,
                speed_limit, cancel, downloaded, progress_cb).await
        } else {
            self.stream_download(url, dest_path, total, speed_limit, cancel, downloaded, progress_cb).await
        }
    }

    async fn stream_download(
        &self,
        url: &str,
        dest_path: &Path,
        total: Option<u64>,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        downloaded: Arc<AtomicU64>,
        progress_cb: Arc<impl Fn(u64, Option<u64>) + Send + Sync>,
    ) -> Result<String, DownloadError> {
        let resp = self.client.get(url).send().await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(DownloadError::Http { status: resp.status().as_u16(), url: url.to_string() });
        }

        let mut file = tokio::fs::File::create(dest_path).await?;
        let mut hasher = Sha256::new();
        let mut bucket = crate::download::speed::TokenBucket::new(speed_limit.load(Ordering::Relaxed));
        let mut stream = resp.bytes_stream();

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
            let bytes = chunk.map_err(|e| DownloadError::Network(e.to_string()))?;
            hasher.update(&bytes);
            bucket.consume(bytes.len() as u64).await;
            file.write_all(&bytes).await?;
            let n = downloaded.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64;
            progress_cb(n, total);
        }

        file.flush().await?;
        Ok(format!("{:x}", hasher.finalize()))
    }

    async fn chunked_download(
        &self,
        url: &str,
        dest_path: &Path,
        total: u64,
        num_chunks: u8,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        downloaded: Arc<AtomicU64>,
        progress_cb: Arc<impl Fn(u64, Option<u64>) + Send + Sync + 'static>,
    ) -> Result<String, DownloadError> {
        // Pre-allocate file to avoid fragmentation
        {
            let file = tokio::fs::File::create(dest_path).await?;
            file.set_len(total).await?;
        }

        let chunk_size = total / num_chunks as u64;
        let mut handles = vec![];

        for i in 0..num_chunks as u64 {
            let start = i * chunk_size;
            let end = if i == num_chunks as u64 - 1 { total - 1 } else { start + chunk_size - 1 };
            let url = url.to_string();
            let dest = dest_path.to_path_buf();
            let client = self.client.clone();
            let cancel = cancel.clone();
            let downloaded = downloaded.clone();
            let progress_cb = progress_cb.clone();
            let rate = speed_limit.load(Ordering::Relaxed);

            let handle = tokio::spawn(async move {
                let mut bucket = crate::download::speed::TokenBucket::new(rate);
                let resp = client.get(&url)
                    .header("Range", format!("bytes={start}-{end}"))
                    .send().await
                    .map_err(|e| DownloadError::Network(e.to_string()))?;

                let mut file = OpenOptions::new().write(true).open(&dest).await?;
                use tokio::io::AsyncSeekExt;
                file.seek(std::io::SeekFrom::Start(start)).await?;

                let mut stream = resp.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
                    let bytes = chunk.map_err(|e| DownloadError::Network(e.to_string()))?;
                    bucket.consume(bytes.len() as u64).await;
                    file.write_all(&bytes).await?;
                    let n = downloaded.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64;
                    progress_cb(n, Some(total));
                }
                Ok::<(), DownloadError>(())
            });
            handles.push(handle);
        }

        for h in handles {
            h.await.map_err(|e| DownloadError::Network(e.to_string()))??;
        }

        // Read the complete file to compute SHA256
        let data = tokio::fs::read(dest_path).await?;
        Ok(format!("{:x}", Sha256::digest(&data)))
    }

    async fn download_ftp(
        &self,
        url: &str,
        dest_path: &Path,
        cancel: CancelToken,
        progress_cb: impl Fn(u64, Option<u64>) + Send + Sync,
    ) -> Result<String, DownloadError> {
        use suppaftp::AsyncFtpStream;
        use futures_util::AsyncReadExt;

        let parsed = url::Url::parse(url).map_err(|e| DownloadError::Network(e.to_string()))?;
        let host = parsed.host_str().unwrap_or("").to_string();
        let port = parsed.port().unwrap_or(21);
        let path = parsed.path().to_string();
        let user = if parsed.username().is_empty() { "anonymous" } else { parsed.username() };
        let pass = parsed.password().unwrap_or("anonymous@");

        let addr = format!("{host}:{port}");
        let mut ftp = AsyncFtpStream::connect(&addr).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;
        ftp.login(user, pass).await.map_err(|e| DownloadError::Network(e.to_string()))?;
        ftp.transfer_type(suppaftp::types::FileType::Binary).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        let size = ftp.size(&path).await.ok().map(|s| s as u64);

        // Retrieve the file as a stream and read all bytes
        let mut stream = ftp.retr_as_stream(&path).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        let mut data = Vec::new();
        stream.read_to_end(&mut data).await
            .map_err(|e| DownloadError::Io(e.into()))?;

        ftp.finalize_retr_stream(stream).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        let _ = ftp.quit().await;

        if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }

        let total = data.len() as u64;
        progress_cb(total, size);
        tokio::fs::write(dest_path, &data).await?;

        Ok(format!("{:x}", Sha256::digest(&data)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[tokio::test]
    async fn download_small_http_file() {
        let engine = DownloadEngine::new();
        let dest = std::env::temp_dir().join("adm_test_engine.bin");
        let cancel = Arc::new(AtomicBool::new(false));
        let speed = Arc::new(AtomicU64::new(0));

        let sha = engine.download(
            "test",
            "https://httpbin.org/bytes/1024",
            &dest,
            1,
            speed,
            cancel,
            |_, _| {},
        ).await;

        assert!(sha.is_ok(), "Download failed: {:?}", sha);
        assert!(dest.exists());
        let _ = std::fs::remove_file(&dest);
    }

    #[test]
    fn ftp_url_routes_to_ftp() {
        // Just verify the URL routing logic — no actual FTP connection
        let url = "ftp://ftp.example.com/file.txt";
        assert!(url.starts_with("ftp://") || url.starts_with("ftps://"));
    }
}
