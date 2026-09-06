use serde::{Deserialize, Serialize};

pub const INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS: u64 = 4_000;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionConnectionGoal {
    DatabaseAccess,
    LibraryAccount,
    DiscoveryFulltext,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionConnectionPhase {
    Opening,
    AwaitingUser,
    Verifying,
    RefreshingParent,
    Ready,
    Cancelled,
    Failed,
}

impl SideraInstitutionConnectionPhase {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Ready | Self::Cancelled | Self::Failed)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionActiveConnection {
    pub transaction_id: String,
    pub goal: SideraInstitutionConnectionGoal,
    pub phase: SideraInstitutionConnectionPhase,
    pub code: String,
    pub message: String,
    pub updated_at_ms: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstitutionConnectionToken {
    pub transaction_id: String,
    pub generation: u64,
    pub goal: SideraInstitutionConnectionGoal,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InstitutionConnectionBeginOutcome {
    Started(InstitutionConnectionToken),
    FocusExisting(InstitutionConnectionToken),
    Busy(SideraInstitutionActiveConnection),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstitutionConnectionTerminal {
    Ready,
    Cancelled,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstitutionConnectionFinalizeOutcome {
    pub connection: SideraInstitutionActiveConnection,
    pub keep_previous_ready: bool,
}

#[derive(Clone, Debug)]
struct InstitutionConnectionRecord {
    public: SideraInstitutionActiveConnection,
    generation: u64,
    previous_ready: bool,
    main_restore_claimed: bool,
}

#[derive(Clone, Debug, Default)]
pub struct InstitutionAuthCoordinator {
    next_transaction_id: u64,
    generation: u64,
    current: Option<InstitutionConnectionRecord>,
}

impl InstitutionAuthCoordinator {
    pub fn current(&self) -> Option<SideraInstitutionActiveConnection> {
        self.current.as_ref().map(|record| record.public.clone())
    }

    pub fn current_token(&self) -> Option<InstitutionConnectionToken> {
        self.current.as_ref().map(record_token)
    }

    pub fn begin(
        &mut self,
        goal: SideraInstitutionConnectionGoal,
        previous_ready: bool,
        updated_at_ms: u128,
    ) -> InstitutionConnectionBeginOutcome {
        if let Some(current) = self.current.as_ref() {
            if !current.public.phase.is_terminal() {
                return if current.public.goal == goal {
                    InstitutionConnectionBeginOutcome::FocusExisting(record_token(current))
                } else {
                    InstitutionConnectionBeginOutcome::Busy(current.public.clone())
                };
            }
        }

        self.next_transaction_id = self.next_transaction_id.saturating_add(1);
        self.generation = self.generation.saturating_add(1);
        let token = InstitutionConnectionToken {
            transaction_id: format!("institution-connection-{}", self.next_transaction_id),
            generation: self.generation,
            goal,
        };
        self.current = Some(InstitutionConnectionRecord {
            public: SideraInstitutionActiveConnection {
                transaction_id: token.transaction_id.clone(),
                goal,
                phase: SideraInstitutionConnectionPhase::Opening,
                code: "SIDERA_INSTITUTION_CONNECTION_OPENING".to_string(),
                message: "正在打开官方机构认证页面。".to_string(),
                updated_at_ms,
            },
            generation: token.generation,
            previous_ready,
            main_restore_claimed: false,
        });
        InstitutionConnectionBeginOutcome::Started(token)
    }

    pub fn is_current(&self, token: &InstitutionConnectionToken) -> bool {
        self.current.as_ref().is_some_and(|record| {
            record.generation == token.generation
                && record.public.transaction_id == token.transaction_id
                && record.public.goal == token.goal
        })
    }

    pub fn is_active(&self, token: &InstitutionConnectionToken) -> bool {
        self.is_current(token)
            && self
                .current
                .as_ref()
                .is_some_and(|record| !record.public.phase.is_terminal())
    }

    pub fn advance(
        &mut self,
        token: &InstitutionConnectionToken,
        phase: SideraInstitutionConnectionPhase,
        code: impl Into<String>,
        message: impl Into<String>,
        updated_at_ms: u128,
    ) -> Option<SideraInstitutionActiveConnection> {
        let record = self.current.as_mut()?;
        if record.generation != token.generation
            || record.public.transaction_id != token.transaction_id
            || record.public.goal != token.goal
            || record.public.phase.is_terminal()
            || phase.is_terminal()
        {
            return None;
        }
        record.public.phase = phase;
        record.public.code = code.into();
        record.public.message = message.into();
        record.public.updated_at_ms = updated_at_ms;
        Some(record.public.clone())
    }

    pub fn finalize(
        &mut self,
        token: &InstitutionConnectionToken,
        terminal: InstitutionConnectionTerminal,
        code: impl Into<String>,
        message: impl Into<String>,
        updated_at_ms: u128,
    ) -> Option<InstitutionConnectionFinalizeOutcome> {
        let record = self.current.as_mut()?;
        if record.generation != token.generation
            || record.public.transaction_id != token.transaction_id
            || record.public.goal != token.goal
            || record.public.phase.is_terminal()
        {
            return None;
        }
        record.public.phase = match terminal {
            InstitutionConnectionTerminal::Ready => SideraInstitutionConnectionPhase::Ready,
            InstitutionConnectionTerminal::Cancelled => SideraInstitutionConnectionPhase::Cancelled,
            InstitutionConnectionTerminal::Failed => SideraInstitutionConnectionPhase::Failed,
        };
        record.public.code = code.into();
        record.public.message = message.into();
        record.public.updated_at_ms = updated_at_ms;
        Some(InstitutionConnectionFinalizeOutcome {
            connection: record.public.clone(),
            keep_previous_ready: terminal != InstitutionConnectionTerminal::Ready
                && record.previous_ready,
        })
    }

    pub fn invalidate_previous_ready(&mut self, token: &InstitutionConnectionToken) -> bool {
        let Some(record) = self.current.as_mut() else {
            return false;
        };
        if record.generation != token.generation
            || record.public.transaction_id != token.transaction_id
            || record.public.goal != token.goal
            || record.public.phase.is_terminal()
        {
            return false;
        }
        record.previous_ready = false;
        true
    }

    pub fn claim_main_restore(&mut self, token: &InstitutionConnectionToken) -> bool {
        let Some(record) = self.current.as_mut() else {
            return false;
        };
        if record.generation != token.generation
            || record.public.transaction_id != token.transaction_id
            || record.public.goal != token.goal
            || record.main_restore_claimed
        {
            return false;
        }
        record.main_restore_claimed = true;
        true
    }

    pub fn reset(&mut self) {
        self.generation = self.generation.saturating_add(1);
        self.current = None;
    }
}

fn record_token(record: &InstitutionConnectionRecord) -> InstitutionConnectionToken {
    InstitutionConnectionToken {
        transaction_id: record.public.transaction_id.clone(),
        generation: record.generation,
        goal: record.public.goal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_transaction_focuses_same_goal_and_rejects_other_goal() {
        let mut coordinator = InstitutionAuthCoordinator::default();
        let started = coordinator.begin(SideraInstitutionConnectionGoal::DatabaseAccess, false, 10);
        let InstitutionConnectionBeginOutcome::Started(started) = started else {
            panic!("connection must start");
        };
        assert_eq!(
            coordinator.begin(SideraInstitutionConnectionGoal::DatabaseAccess, false, 11,),
            InstitutionConnectionBeginOutcome::FocusExisting(started.clone())
        );
        assert!(matches!(
            coordinator.begin(SideraInstitutionConnectionGoal::LibraryAccount, false, 12,),
            InstitutionConnectionBeginOutcome::Busy(_)
        ));
    }

    #[test]
    fn ready_is_terminal_and_late_close_cannot_downgrade_it() {
        let mut coordinator = InstitutionAuthCoordinator::default();
        let InstitutionConnectionBeginOutcome::Started(token) =
            coordinator.begin(SideraInstitutionConnectionGoal::DatabaseAccess, false, 10)
        else {
            panic!("connection must start");
        };
        assert!(coordinator.is_active(&token));
        coordinator
            .finalize(
                &token,
                InstitutionConnectionTerminal::Ready,
                "READY",
                "ready",
                20,
            )
            .unwrap();
        assert!(coordinator.is_current(&token));
        assert!(!coordinator.is_active(&token));
        assert!(coordinator
            .finalize(
                &token,
                InstitutionConnectionTerminal::Cancelled,
                "CANCELLED",
                "late close",
                21,
            )
            .is_none());
        assert_eq!(
            coordinator.current().unwrap().phase,
            SideraInstitutionConnectionPhase::Ready
        );
    }

    #[test]
    fn cancellation_and_creation_failure_preserve_proven_ready() {
        for terminal in [
            InstitutionConnectionTerminal::Cancelled,
            InstitutionConnectionTerminal::Failed,
        ] {
            let mut coordinator = InstitutionAuthCoordinator::default();
            let InstitutionConnectionBeginOutcome::Started(token) =
                coordinator.begin(SideraInstitutionConnectionGoal::LibraryAccount, true, 10)
            else {
                panic!("connection must start");
            };
            let outcome = coordinator
                .finalize(&token, terminal, "TERMINAL", "terminal", 20)
                .unwrap();
            assert!(outcome.keep_previous_ready);
        }
    }

    #[test]
    fn explicit_login_invalidation_prevents_old_ready_from_being_restored() {
        let mut coordinator = InstitutionAuthCoordinator::default();
        let InstitutionConnectionBeginOutcome::Started(token) =
            coordinator.begin(SideraInstitutionConnectionGoal::DatabaseAccess, true, 10)
        else {
            panic!("connection must start");
        };
        assert!(coordinator.invalidate_previous_ready(&token));
        let outcome = coordinator
            .finalize(
                &token,
                InstitutionConnectionTerminal::Cancelled,
                "CANCELLED",
                "cancelled",
                20,
            )
            .unwrap();
        assert!(!outcome.keep_previous_ready);
    }

    #[test]
    fn reset_and_generation_reject_stale_callbacks() {
        let mut coordinator = InstitutionAuthCoordinator::default();
        let InstitutionConnectionBeginOutcome::Started(old) =
            coordinator.begin(SideraInstitutionConnectionGoal::DatabaseAccess, false, 10)
        else {
            panic!("connection must start");
        };
        coordinator.reset();
        assert!(!coordinator.is_current(&old));
        assert!(coordinator
            .advance(
                &old,
                SideraInstitutionConnectionPhase::Verifying,
                "STALE",
                "stale",
                20,
            )
            .is_none());
    }

    #[test]
    fn main_window_restore_is_claimed_once() {
        let mut coordinator = InstitutionAuthCoordinator::default();
        let InstitutionConnectionBeginOutcome::Started(token) =
            coordinator.begin(SideraInstitutionConnectionGoal::DatabaseAccess, false, 10)
        else {
            panic!("connection must start");
        };
        assert!(coordinator.claim_main_restore(&token));
        assert!(!coordinator.claim_main_restore(&token));
    }

    #[test]
    fn public_connection_payload_has_no_navigation_or_secret_material() {
        let mut coordinator = InstitutionAuthCoordinator::default();
        coordinator.begin(
            SideraInstitutionConnectionGoal::DiscoveryFulltext,
            false,
            10,
        );
        let json = serde_json::to_string(&coordinator.current()).unwrap();
        for forbidden in ["query", "fragment", "ticket", "cookie", "password"] {
            assert!(!json.to_ascii_lowercase().contains(forbidden));
        }
    }
}
