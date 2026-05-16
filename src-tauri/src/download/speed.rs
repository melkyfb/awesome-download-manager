use std::time::{Duration, Instant};
use tokio::time::sleep;

/// Token bucket rate limiter. rate is bytes/s; 0 means unlimited.
pub struct TokenBucket {
    rate: u64,
    tokens: f64,
    last_refill: Instant,
}

impl TokenBucket {
    pub fn new(rate: u64) -> Self {
        Self {
            rate,
            tokens: rate as f64,
            last_refill: Instant::now(),
        }
    }

    /// Consume `bytes` tokens, sleeping if necessary to respect the rate.
    /// Does nothing if rate == 0 (unlimited).
    pub async fn consume(&mut self, bytes: u64) {
        if self.rate == 0 {
            return;
        }
        self.refill();
        let needed = bytes as f64;
        if self.tokens >= needed {
            self.tokens -= needed;
            return;
        }
        let deficit = needed - self.tokens;
        let wait_secs = deficit / self.rate as f64;
        sleep(Duration::from_secs_f64(wait_secs)).await;
        self.tokens = 0.0;
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.rate as f64).min(self.rate as f64);
        self.last_refill = now;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlimited_rate_is_zero() {
        let bucket = TokenBucket::new(0);
        assert_eq!(bucket.rate, 0);
    }

    #[test]
    fn tokens_start_at_capacity() {
        let bucket = TokenBucket::new(1000);
        assert!((bucket.tokens - 1000.0).abs() < 1.0);
    }

    #[tokio::test]
    async fn consume_within_bucket_does_not_sleep() {
        let mut bucket = TokenBucket::new(1_000_000); // 1 MB/s — very generous
        let start = std::time::Instant::now();
        bucket.consume(100).await; // 100 bytes, well within bucket
        assert!(start.elapsed().as_millis() < 50, "should not sleep for 100 bytes at 1 MB/s");
    }

    #[tokio::test]
    async fn unlimited_consume_does_not_sleep() {
        let mut bucket = TokenBucket::new(0);
        let start = std::time::Instant::now();
        bucket.consume(1_000_000).await; // large amount, should not sleep
        assert!(start.elapsed().as_millis() < 10);
    }
}
