#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
fn main() {
    #[cfg(debug_assertions)]
    {
        let mut args = std::env::args().skip(1);
        if args.next().as_deref() == Some("--input-probe") {
            let result = args.next().ok_or_else(|| "report path required".to_string())
                .and_then(|path| dual_pet_lib::diagnostics::input_probe(std::path::Path::new(&path)));
            if let Err(error) = result { eprintln!("Input probe failed: {error}"); std::process::exit(1); }
            return;
        }
    }
    dual_pet_lib::run();
}

