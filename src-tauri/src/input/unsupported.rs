use super::Shared;
use std::sync::Arc;

pub(super) fn preflight(shared: &Shared) { shared.fail("unsupported-platform"); }
pub(super) fn request_access(shared: &Shared) { shared.fail("unsupported-platform"); }
pub(super) fn run(_: Arc<Shared>) {}
