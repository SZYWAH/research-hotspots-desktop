use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use research_hotspots_core::document_derived::{
    document_resource_fingerprint_matches, parse_document_byte_range, DOCUMENT_PARSE_MAX_BYTES,
};
pub(crate) use research_hotspots_core::document_protocol::SideraDocumentResourceRegistry;
use research_hotspots_core::document_protocol::{
    document_protocol_error_response as response, document_protocol_headers as local_headers,
    document_protocol_range_not_satisfiable_response as range_not_satisfiable_response,
    document_resource_token as resource_token,
};
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext};

pub(crate) fn handle_document_protocol<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if context.webview_label() != "main" {
        return response(
            StatusCode::FORBIDDEN,
            "SIDERA_DOCUMENT_RESOURCE_WEBVIEW_FORBIDDEN",
        );
    }
    if request.method() == Method::OPTIONS {
        return local_headers(Response::builder())
            .status(StatusCode::NO_CONTENT)
            .body(Vec::new())
            .expect("static Sidera document options response must be valid");
    }
    if request.method() == Method::POST && request.uri().path().starts_with("/ocr-upload/") {
        let token = match crate::sidera_document_ocr::ocr_upload_token(
            request.uri().path(),
            request.uri().query().is_some(),
        ) {
            Ok(token) => token.to_string(),
            Err(code) => return response(StatusCode::BAD_REQUEST, &code),
        };
        let content_type = request
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(ToString::to_string);
        let runtime = context
            .app_handle()
            .state::<crate::sidera_document_ocr::SideraDocumentOcrRuntimeState>();
        return match crate::sidera_document_ocr::accept_ocr_upload(
            &runtime,
            &token,
            content_type.as_deref(),
            request.into_body(),
        ) {
            Ok(()) => local_headers(Response::builder())
                .status(StatusCode::ACCEPTED)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(br#"{"accepted":true}"#.to_vec())
                .expect("static OCR upload response must be valid"),
            Err(code) => {
                let status = match code.as_str() {
                    "SIDERA_DOCUMENT_OCR_UPLOAD_TOKEN_INVALID" => StatusCode::NOT_FOUND,
                    "SIDERA_DOCUMENT_OCR_UPLOAD_TOKEN_EXPIRED" => StatusCode::GONE,
                    "SIDERA_DOCUMENT_OCR_BUSY" => StatusCode::CONFLICT,
                    "SIDERA_DOCUMENT_OCR_UPLOAD_SIZE_INVALID" => StatusCode::PAYLOAD_TOO_LARGE,
                    _ => StatusCode::BAD_REQUEST,
                };
                response(status, &code)
            }
        };
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "SIDERA_DOCUMENT_RESOURCE_METHOD_INVALID",
        );
    }
    let token = match resource_token(&request) {
        Ok(token) => token,
        Err(code) => return response(StatusCode::BAD_REQUEST, &code),
    };
    let registry = context
        .app_handle()
        .state::<SideraDocumentResourceRegistry>();
    let descriptor = match registry.resolve(token) {
        Ok(descriptor) => descriptor,
        Err(code) => return response(StatusCode::NOT_FOUND, &code),
    };
    if descriptor.byte_size == 0 || descriptor.byte_size > DOCUMENT_PARSE_MAX_BYTES {
        return response(
            StatusCode::PAYLOAD_TOO_LARGE,
            "SIDERA_DOCUMENT_PARSE_SIZE_LIMIT_EXCEEDED",
        );
    }
    let metadata = match std::fs::metadata(&descriptor.path) {
        Ok(metadata) if document_resource_fingerprint_matches(&descriptor, &metadata) => metadata,
        _ => {
            return response(
                StatusCode::CONFLICT,
                "SIDERA_DOCUMENT_RESOURCE_VERSION_CHANGED",
            )
        }
    };
    let range_header = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    let range = match parse_document_byte_range(range_header, metadata.len()) {
        Ok(range) => range,
        Err(code) => return range_not_satisfiable_response(metadata.len(), &code),
    };
    let length = range.end - range.start + 1;
    let mut body = Vec::new();
    if request.method() == Method::GET {
        let mut file = match File::open(&descriptor.path) {
            Ok(file) => file,
            Err(_) => {
                return response(
                    StatusCode::NOT_FOUND,
                    "SIDERA_DOCUMENT_RESOURCE_UNAVAILABLE",
                )
            }
        };
        if file.seek(SeekFrom::Start(range.start)).is_err() {
            return response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "SIDERA_DOCUMENT_RESOURCE_READ_FAILED",
            );
        }
        let mut limited = file.take(length);
        if limited.read_to_end(&mut body).is_err() || body.len() as u64 != length {
            return response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "SIDERA_DOCUMENT_RESOURCE_READ_FAILED",
            );
        }
        if std::fs::metadata(&descriptor.path)
            .ok()
            .as_ref()
            .is_none_or(|metadata| !document_resource_fingerprint_matches(&descriptor, metadata))
        {
            return response(
                StatusCode::CONFLICT,
                "SIDERA_DOCUMENT_RESOURCE_VERSION_CHANGED",
            );
        }
    }
    let status = if range.partial {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let mut builder = local_headers(Response::builder())
        .status(status)
        .header(header::CONTENT_TYPE, descriptor.mime_type)
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ETAG, format!("\"{}\"", descriptor.sha256));
    if range.partial {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", range.start, range.end, metadata.len()),
        );
    }
    builder.body(body).unwrap_or_else(|_| {
        response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "SIDERA_DOCUMENT_RESOURCE_RESPONSE_FAILED",
        )
    })
}
