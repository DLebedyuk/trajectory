// Десктопная оболочка. Никакого отдельного интерфейса: внутри работает
// то же самое React-приложение из apps/web.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_deep_link::DeepLinkExt;

fn main() {
    tauri::Builder::default()
        // Должен идти первым: Windows/Linux открывают deep-link, запуская
        // ВТОРОЙ процесс с URL в argv — без single-instance это была бы
        // новая копия окна, а не событие в уже открытом приложении.
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Приложение не ставится через инсталлятор (портативный exe),
            // поэтому статической схемы в tauri.conf.json недостаточно —
            // ассоциацию в реестре Windows нужно создавать самим при старте.
            app.deep_link().register("traektoria")?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
