fn main() {
    tauri_build::build();
    // Expose target triple so video module can locate the sidecar in dev mode
    let triple = std::env::var("TARGET").unwrap_or_default();
    println!("cargo:rustc-env=SIDECAR_TARGET_TRIPLE={triple}");
}
