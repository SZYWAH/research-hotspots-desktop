use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Manager, Window, Wry};

pub(crate) const MAIN_WINDOW_MISSING: &str = "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING";
pub(crate) const MAIN_WINDOW_HANDLE_UNAVAILABLE: &str =
    "SIDERA_INSTITUTION_MAIN_WINDOW_HANDLE_UNAVAILABLE";
pub(crate) const WINDOW_OWNER_BIND_FAILED: &str = "SIDERA_INSTITUTION_WINDOW_OWNER_BIND_FAILED";

#[derive(Clone)]
pub(crate) struct SideraMainWindowHost {
    window: Window<Wry>,
}

impl SideraMainWindowHost {
    pub(crate) fn window(&self) -> &Window<Wry> {
        &self.window
    }
}

pub(crate) fn resolve_main_window_host(
    app: &AppHandle,
) -> Result<SideraMainWindowHost, &'static str> {
    let window = app.get_window("main").ok_or(MAIN_WINDOW_MISSING)?;

    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|_| MAIN_WINDOW_HANDLE_UNAVAILABLE)?;
        if hwnd.0.is_null() {
            return Err(WINDOW_OWNER_BIND_FAILED);
        }
        Ok(SideraMainWindowHost { window })
    }

    #[cfg(not(windows))]
    {
        Ok(SideraMainWindowHost { window })
    }
}

pub(crate) fn bind_webview_window_owner<'a, M>(
    builder: WebviewWindowBuilder<'a, Wry, M>,
    host: &SideraMainWindowHost,
) -> Result<WebviewWindowBuilder<'a, Wry, M>, &'static str>
where
    M: Manager<Wry>,
{
    #[cfg(windows)]
    {
        let hwnd = host
            .window
            .hwnd()
            .map_err(|_| MAIN_WINDOW_HANDLE_UNAVAILABLE)?;
        if hwnd.0.is_null() {
            return Err(WINDOW_OWNER_BIND_FAILED);
        }
        Ok(builder.owner_raw(hwnd))
    }

    #[cfg(not(windows))]
    {
        let _ = host;
        Ok(builder)
    }
}
