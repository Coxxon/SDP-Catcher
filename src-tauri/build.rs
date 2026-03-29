use std::env;
use std::path::PathBuf;

fn main() {
    let dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let npcap_lib = PathBuf::from(dir).join("npcap-sdk").join("Lib").join("x64");
    println!("cargo:rustc-link-search=native={}", npcap_lib.display());
    
    // Config with Admin Manifest
    let mut attrs = tauri_build::Attributes::new();
    #[cfg(windows)]
    {
        attrs = attrs.windows_attributes(tauri_build::WindowsAttributes::new().app_manifest(include_str!("admin.manifest")));
    }
    
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
