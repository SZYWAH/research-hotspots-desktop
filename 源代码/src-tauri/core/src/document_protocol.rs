use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use http::{header, Request, Response, StatusCode};

use crate::document_derived::SideraDocumentResourceDescriptor;

const MAX_REGISTERED_RESOURCES: usize = 64;

#[derive(Default)]
struct SideraDocumentResourceRegistryInner {
    resources: HashMap<String, SideraDocumentResourceDescriptor>,
    least_recently_used: VecDeque<String>,
}

pub struct SideraDocumentResourceRegistry {
    resources: Mutex<SideraDocumentResourceRegistryInner>,
    capacity: usize,
}

impl Default for SideraDocumentResourceRegistry {
    fn default() -> Self {
        Self {
            resources: Mutex::new(SideraDocumentResourceRegistryInner::default()),
            capacity: MAX_REGISTERED_RESOURCES,
        }
    }
}

impl SideraDocumentResourceRegistry {
    #[cfg(test)]
    fn with_capacity(capacity: usize) -> Self {
        Self {
            resources: Mutex::new(SideraDocumentResourceRegistryInner::default()),
            capacity: capacity.max(1),
        }
    }

    fn touch(resources: &mut SideraDocumentResourceRegistryInner, token: &str) {
        if let Some(position) = resources
            .least_recently_used
            .iter()
            .position(|entry| entry == token)
        {
            resources.least_recently_used.remove(position);
        }
        resources.least_recently_used.push_back(token.to_string());
    }

    pub fn register(&self, descriptor: SideraDocumentResourceDescriptor) -> Result<(), String> {
        let mut resources = self
            .resources
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_RESOURCE_REGISTRY_UNAVAILABLE".to_string())?;
        if resources.resources.len() >= self.capacity
            && !resources.resources.contains_key(&descriptor.token)
        {
            while let Some(token) = resources.least_recently_used.pop_front() {
                if resources.resources.remove(&token).is_some() {
                    break;
                }
            }
        }
        let token = descriptor.token.clone();
        resources.resources.insert(token.clone(), descriptor);
        Self::touch(&mut resources, &token);
        Ok(())
    }

    pub fn resolve(&self, token: &str) -> Result<SideraDocumentResourceDescriptor, String> {
        let mut resources = self
            .resources
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_RESOURCE_REGISTRY_UNAVAILABLE".to_string())?;
        let descriptor = resources
            .resources
            .get(token)
            .cloned()
            .ok_or_else(|| "SIDERA_DOCUMENT_RESOURCE_NOT_REGISTERED".to_string())?;
        Self::touch(&mut resources, token);
        Ok(descriptor)
    }
}

pub fn document_resource_token(request: &Request<Vec<u8>>) -> Result<&str, String> {
    if request.uri().query().is_some() {
        return Err("SIDERA_DOCUMENT_RESOURCE_URI_INVALID".to_string());
    }
    let segments = request
        .uri()
        .path()
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if segments.len() != 2
        || segments[0] != "version"
        || segments[1].len() > 128
        || !segments[1]
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("SIDERA_DOCUMENT_RESOURCE_URI_INVALID".to_string());
    }
    Ok(segments[1])
}

pub fn document_protocol_headers(builder: http::response::Builder) -> http::response::Builder {
    builder
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            "GET, HEAD, POST, OPTIONS",
        )
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range, Content-Type")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Accept-Ranges, Content-Length, Content-Range, ETag",
        )
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
}

pub fn document_protocol_error_response(status: StatusCode, code: &str) -> Response<Vec<u8>> {
    document_protocol_headers(Response::builder())
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CONTENT_LENGTH, code.len().to_string())
        .body(code.as_bytes().to_vec())
        .expect("static Sidera document error response must be valid")
}

pub fn document_protocol_range_not_satisfiable_response(
    total: u64,
    code: &str,
) -> Response<Vec<u8>> {
    document_protocol_headers(Response::builder())
        .status(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CONTENT_LENGTH, code.len().to_string())
        .header(header::CONTENT_RANGE, format!("bytes */{total}"))
        .body(code.as_bytes().to_vec())
        .expect("static Sidera document range response must be valid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn descriptor(token: &str) -> SideraDocumentResourceDescriptor {
        SideraDocumentResourceDescriptor {
            token: token.to_string(),
            path: PathBuf::from(format!("{token}.pdf")),
            mime_type: "application/pdf".to_string(),
            byte_size: 1,
            sha256: "0".repeat(64),
            modified_at_ns: 1,
        }
    }

    fn request(uri: &str) -> Request<Vec<u8>> {
        Request::builder().uri(uri).body(Vec::new()).unwrap()
    }

    #[test]
    fn document_resource_uri_accepts_only_a_single_valid_version_token() {
        for token in ["a", "Document_01", "sha256-ABC_123"] {
            let request = request(&format!("/version/{token}"));
            assert_eq!(document_resource_token(&request).unwrap(), token);
        }
    }

    #[test]
    fn document_resource_uri_rejects_queries_invalid_characters_and_long_tokens() {
        let overlong_token = "a".repeat(129);
        let invalid_uris = [
            "/version/token?download=1".to_string(),
            "/version/token.pdf".to_string(),
            "/version/token%20name".to_string(),
            "/version/token~name".to_string(),
            format!("/version/{overlong_token}"),
        ];

        for uri in invalid_uris {
            let request = request(&uri);
            assert_eq!(
                document_resource_token(&request).unwrap_err(),
                "SIDERA_DOCUMENT_RESOURCE_URI_INVALID",
                "unexpectedly accepted {uri}"
            );
        }
    }

    #[test]
    fn resource_registry_evicts_the_least_recently_resolved_token() {
        let registry = SideraDocumentResourceRegistry::with_capacity(2);
        registry.register(descriptor("first")).unwrap();
        registry.register(descriptor("second")).unwrap();

        assert_eq!(registry.resolve("first").unwrap().token, "first");
        registry.register(descriptor("third")).unwrap();

        assert_eq!(
            registry.resolve("second").unwrap_err(),
            "SIDERA_DOCUMENT_RESOURCE_NOT_REGISTERED"
        );
        assert_eq!(registry.resolve("first").unwrap().token, "first");
        assert_eq!(registry.resolve("third").unwrap().token, "third");
    }

    #[test]
    fn updating_a_registered_token_refreshes_it_without_growing_the_registry() {
        let registry = SideraDocumentResourceRegistry::with_capacity(2);
        registry.register(descriptor("first")).unwrap();
        registry.register(descriptor("second")).unwrap();
        let mut refreshed = descriptor("first");
        refreshed.byte_size = 2;
        registry.register(refreshed).unwrap();
        registry.register(descriptor("third")).unwrap();

        assert_eq!(registry.resolve("first").unwrap().byte_size, 2);
        assert_eq!(
            registry.resolve("second").unwrap_err(),
            "SIDERA_DOCUMENT_RESOURCE_NOT_REGISTERED"
        );
    }

    fn header_value<'a>(response: &'a Response<Vec<u8>>, name: &str) -> &'a str {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .expect("protocol response header must be present and textual")
    }

    fn assert_cross_origin_range_headers(response: &Response<Vec<u8>>) {
        assert_eq!(header_value(response, "access-control-allow-origin"), "*");
        assert_eq!(
            header_value(response, "access-control-allow-methods"),
            "GET, HEAD, OPTIONS"
        );
        assert_eq!(
            header_value(response, "access-control-allow-headers"),
            "Range"
        );
        assert_eq!(
            header_value(response, "access-control-expose-headers"),
            "Accept-Ranges, Content-Length, Content-Range, ETag"
        );
        assert_eq!(header_value(response, "accept-ranges"), "bytes");
        assert_eq!(header_value(response, "cache-control"), "no-store");
    }

    #[test]
    fn ordinary_error_responses_keep_stable_codes_cross_origin_readable() {
        let code = "SIDERA_DOCUMENT_RESOURCE_VERSION_CHANGED";
        for status in [
            StatusCode::BAD_REQUEST,
            StatusCode::FORBIDDEN,
            StatusCode::NOT_FOUND,
            StatusCode::METHOD_NOT_ALLOWED,
            StatusCode::CONFLICT,
            StatusCode::PAYLOAD_TOO_LARGE,
            StatusCode::INTERNAL_SERVER_ERROR,
        ] {
            let response = document_protocol_error_response(status, code);
            assert_eq!(response.status(), status);
            assert_eq!(response.body(), code.as_bytes());
            assert_eq!(
                header_value(&response, "content-length"),
                code.len().to_string()
            );
            assert_cross_origin_range_headers(&response);
        }
    }

    #[test]
    fn invalid_range_response_exposes_content_range_and_stable_code() {
        let code = "SIDERA_DOCUMENT_RESOURCE_RANGE_INVALID";
        let response = document_protocol_range_not_satisfiable_response(4096, code);

        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(response.body(), code.as_bytes());
        assert_eq!(header_value(&response, "content-range"), "bytes */4096");
        assert_eq!(
            header_value(&response, "content-length"),
            code.len().to_string()
        );
        assert_cross_origin_range_headers(&response);
    }

    #[test]
    fn successful_protocol_headers_remain_cross_origin_range_capable() {
        let response = document_protocol_headers(Response::builder())
            .status(StatusCode::OK)
            .header(header::CONTENT_LENGTH, "4")
            .body(vec![1, 2, 3, 4])
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(header_value(&response, "content-length"), "4");
        assert_cross_origin_range_headers(&response);
    }
}
