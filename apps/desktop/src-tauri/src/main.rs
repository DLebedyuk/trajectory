// Десктопная оболочка. Никакого отдельного интерфейса: внутри работает
// то же самое React-приложение из apps/web.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
