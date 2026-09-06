use http::{Request, StatusCode};
use research_hotspots_core::document_protocol::{
    document_protocol_error_response, document_resource_token,
};
use research_hotspots_core::pi_protocol::{drain_jsonl_records, normalize_openai_base_url};

#[cfg(target_os = "windows")]
#[link(name = "comctl32")]
extern "system" {
    fn TaskDialogIndirect(
        task_config: *const core::ffi::c_void,
        button: *mut i32,
        radio_button: *mut i32,
        verification_flag_checked: *mut i32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
fn retain_task_dialog_import_without_calling_it() {
    std::hint::black_box(TaskDialogIndirect as *const () as usize);
}

#[cfg(not(target_os = "windows"))]
fn retain_task_dialog_import_without_calling_it() {}

fn main() {
    retain_task_dialog_import_without_calling_it();

    let request = Request::builder()
        .uri("/version/smoke_token-01")
        .body(Vec::new())
        .expect("smoke request must be valid");
    assert_eq!(
        document_resource_token(&request).expect("smoke token must be accepted"),
        "smoke_token-01"
    );

    let response = document_protocol_error_response(
        StatusCode::NOT_FOUND,
        "SIDERA_DOCUMENT_RESOURCE_NOT_REGISTERED",
    );
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|value| value.to_str().ok()),
        Some("*")
    );

    assert_eq!(
        normalize_openai_base_url("https://example.test/chat/completions")
            .expect("OpenAI-compatible endpoint must normalize"),
        "https://example.test/v1"
    );
    let mut pending = b"{\"type\":\"turn-start\"}\npartial".to_vec();
    let records = drain_jsonl_records(&mut pending);
    assert_eq!(records, vec![b"{\"type\":\"turn-start\"}".to_vec()]);
    assert_eq!(pending, b"partial");

    println!("SIDERA_WINDOWS_TEST_HOST_SMOKE_PASS");
}
