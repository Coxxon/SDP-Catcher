use std::env;
use std::path::PathBuf;

fn main() {
    let dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let npcap_lib = PathBuf::from(dir).join("npcap-sdk").join("Lib").join("x64");
    println!("cargo:rustc-link-search=native={}", npcap_lib.display());
    
    tauri_build::build()
}
