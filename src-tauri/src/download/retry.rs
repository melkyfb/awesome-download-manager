use std::time::Duration;
use tokio::time::sleep;

/// Retry an async operation up to `max_attempts` times with exponential backoff.
/// Backoff: 1s after attempt 1, 2s after attempt 2, 4s after attempt 3.
/// Only retries on `Err`. Permanent errors (e.g. HTTP 4xx) must be mapped
/// by callers to a non-retryable signal before calling this function.
pub async fn with_retry<T, E, F, Fut>(
    max_attempts: u32,
    mut operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut attempt = 0;
    loop {
        match operation().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                attempt += 1;
                if attempt >= max_attempts {
                    return Err(e);
                }
                let delay = Duration::from_secs(1 << (attempt - 1)); // 1s, 2s, 4s
                sleep(delay).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn succeeds_on_first_try() {
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();
        let result = with_retry::<i32, &str, _, _>(3, || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Ok(42)
            }
        })
        .await;
        assert_eq!(result, Ok(42));
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn retries_on_failure_then_succeeds() {
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();
        let result = with_retry::<i32, &str, _, _>(3, || {
            let c = c.clone();
            async move {
                let n = c.fetch_add(1, Ordering::SeqCst);
                if n < 2 { Err("transient") } else { Ok(99) }
            }
        })
        .await;
        assert_eq!(result, Ok(99));
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn exhausts_retries_and_returns_error() {
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();
        let result = with_retry::<i32, &str, _, _>(3, || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err("permanent")
            }
        })
        .await;
        assert_eq!(result, Err("permanent"));
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }
}
