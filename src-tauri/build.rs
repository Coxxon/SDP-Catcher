fn main() {
    // 1. Setup Windows Attributes for UAC Administrator privileges
    let mut attrs = tauri_build::Attributes::new();
    attrs = attrs.windows_attributes(
        tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("admin.manifest"))
    );

    // 2. Setup Npcap SDK linking
    let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let npcap_lib = std::path::PathBuf::from(dir).join("npcap-sdk").join("Lib").join("x64");
    println!("cargo:rustc-link-search=native={}", npcap_lib.display());
    
    // 3. Trigger build with attributes
    tauri_build::try_build(attrs).expect("failed to build tauri-app");
}
