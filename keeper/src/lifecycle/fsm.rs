use crate::error::{KeeperError, Result};

/// Competition lifecycle states, following strict linear progression.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompetitionState {
    Upcoming,
    Live,
    Scoring,
    Settled,
}

impl CompetitionState {
    /// Check whether transitioning from this state to `next` is valid.
    pub fn can_transition_to(&self, next: &CompetitionState) -> bool {
        matches!(
            (self, next),
            (CompetitionState::Upcoming, CompetitionState::Live)
                | (CompetitionState::Live, CompetitionState::Scoring)
                | (CompetitionState::Scoring, CompetitionState::Settled)
        )
    }

    /// Attempt to transition to the next state. Returns the new state on success.
    pub fn transition(self, next: CompetitionState) -> Result<CompetitionState> {
        if self.can_transition_to(&next) {
            Ok(next)
        } else {
            Err(KeeperError::InvalidState(format!(
                "cannot transition from {:?} to {:?}",
                self, next
            )))
        }
    }
}

impl std::fmt::Display for CompetitionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(state_to_string(self))
    }
}

/// Parse a competition state from a database string.
pub fn parse_state(s: &str) -> Result<CompetitionState> {
    match s {
        "upcoming" => Ok(CompetitionState::Upcoming),
        "live" => Ok(CompetitionState::Live),
        "scoring" => Ok(CompetitionState::Scoring),
        "settled" => Ok(CompetitionState::Settled),
        _ => Err(KeeperError::InvalidState(format!(
            "unknown competition state: {s}"
        ))),
    }
}

/// Serialize a competition state to its database string representation.
pub fn state_to_string(state: &CompetitionState) -> &'static str {
    match state {
        CompetitionState::Upcoming => "upcoming",
        CompetitionState::Live => "live",
        CompetitionState::Scoring => "scoring",
        CompetitionState::Settled => "settled",
    }
}

/// Background monitor that checks for competition state transitions.
///
/// Polls the database periodically and advances competitions through
/// their lifecycle based on current time vs start/end times.
pub async fn monitor(pool: sqlx::PgPool) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));

    loop {
        interval.tick().await;

        match check_transitions(&pool).await {
            Ok(count) => {
                if count > 0 {
                    tracing::info!(transitions = count, "processed competition state transitions");
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "failed to check competition transitions");
            }
        }
    }
}

async fn check_transitions(pool: &sqlx::PgPool) -> Result<usize> {
    let now = chrono::Utc::now();
    let mut transitions = 0;

    // Upcoming -> Live: start_time has passed
    let upcoming_rows = sqlx::query_as::<_, (uuid::Uuid, String)>(
        "SELECT id, status FROM competitions WHERE status = 'upcoming' AND start_time <= $1",
    )
    .bind(now)
    .fetch_all(pool)
    .await?;

    for (id, _status) in &upcoming_rows {
        let current = parse_state("upcoming")?;
        let next = CompetitionState::Live;
        if current.can_transition_to(&next) {
            sqlx::query("UPDATE competitions SET status = $1 WHERE id = $2")
                .bind(state_to_string(&next))
                .bind(id)
                .execute(pool)
                .await?;
            tracing::info!(competition_id = %id, from = "upcoming", to = "live", "competition state transition");
            transitions += 1;
        }
    }

    // Live -> Scoring: end_time has passed
    let live_rows = sqlx::query_as::<_, (uuid::Uuid, String)>(
        "SELECT id, status FROM competitions WHERE status = 'live' AND end_time <= $1",
    )
    .bind(now)
    .fetch_all(pool)
    .await?;

    for (id, _status) in &live_rows {
        let current = parse_state("live")?;
        let next = CompetitionState::Scoring;
        if current.can_transition_to(&next) {
            sqlx::query("UPDATE competitions SET status = $1 WHERE id = $2")
                .bind(state_to_string(&next))
                .bind(id)
                .execute(pool)
                .await?;
            tracing::info!(competition_id = %id, from = "live", to = "scoring", "competition state transition");
            transitions += 1;
        }
    }

    Ok(transitions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upcoming_to_live() {
        let state = CompetitionState::Upcoming;
        assert!(state.can_transition_to(&CompetitionState::Live));
        let new_state = state.transition(CompetitionState::Live).unwrap();
        assert_eq!(new_state, CompetitionState::Live);
    }

    #[test]
    fn test_live_to_scoring() {
        let state = CompetitionState::Live;
        assert!(state.can_transition_to(&CompetitionState::Scoring));
        let new_state = state.transition(CompetitionState::Scoring).unwrap();
        assert_eq!(new_state, CompetitionState::Scoring);
    }

    #[test]
    fn test_scoring_to_settled() {
        let state = CompetitionState::Scoring;
        assert!(state.can_transition_to(&CompetitionState::Settled));
        let new_state = state.transition(CompetitionState::Settled).unwrap();
        assert_eq!(new_state, CompetitionState::Settled);
    }

    #[test]
    fn test_cannot_go_backwards_live_to_upcoming() {
        let state = CompetitionState::Live;
        assert!(!state.can_transition_to(&CompetitionState::Upcoming));
        assert!(state.transition(CompetitionState::Upcoming).is_err());
    }

    #[test]
    fn test_cannot_go_backwards_scoring_to_live() {
        let state = CompetitionState::Scoring;
        assert!(!state.can_transition_to(&CompetitionState::Live));
        assert!(state.transition(CompetitionState::Live).is_err());
    }

    #[test]
    fn test_cannot_go_backwards_settled_to_scoring() {
        let state = CompetitionState::Settled;
        assert!(!state.can_transition_to(&CompetitionState::Scoring));
        assert!(state.transition(CompetitionState::Scoring).is_err());
    }

    #[test]
    fn test_cannot_skip_upcoming_to_scoring() {
        let state = CompetitionState::Upcoming;
        assert!(!state.can_transition_to(&CompetitionState::Scoring));
        assert!(state.transition(CompetitionState::Scoring).is_err());
    }

    #[test]
    fn test_cannot_skip_upcoming_to_settled() {
        let state = CompetitionState::Upcoming;
        assert!(!state.can_transition_to(&CompetitionState::Settled));
    }

    #[test]
    fn test_cannot_skip_live_to_settled() {
        let state = CompetitionState::Live;
        assert!(!state.can_transition_to(&CompetitionState::Settled));
    }

    #[test]
    fn test_settled_is_terminal() {
        let state = CompetitionState::Settled;
        assert!(!state.can_transition_to(&CompetitionState::Upcoming));
        assert!(!state.can_transition_to(&CompetitionState::Live));
        assert!(!state.can_transition_to(&CompetitionState::Scoring));
        assert!(!state.can_transition_to(&CompetitionState::Settled));
    }

    #[test]
    fn test_self_transition_not_allowed() {
        assert!(!CompetitionState::Upcoming.can_transition_to(&CompetitionState::Upcoming));
        assert!(!CompetitionState::Live.can_transition_to(&CompetitionState::Live));
        assert!(!CompetitionState::Scoring.can_transition_to(&CompetitionState::Scoring));
    }

    #[test]
    fn test_parse_state_valid() {
        assert_eq!(parse_state("upcoming").unwrap(), CompetitionState::Upcoming);
        assert_eq!(parse_state("live").unwrap(), CompetitionState::Live);
        assert_eq!(parse_state("scoring").unwrap(), CompetitionState::Scoring);
        assert_eq!(parse_state("settled").unwrap(), CompetitionState::Settled);
    }

    #[test]
    fn test_parse_state_invalid() {
        assert!(parse_state("unknown").is_err());
        assert!(parse_state("").is_err());
        assert!(parse_state("LIVE").is_err());
    }

    #[test]
    fn test_state_to_string() {
        assert_eq!(state_to_string(&CompetitionState::Upcoming), "upcoming");
        assert_eq!(state_to_string(&CompetitionState::Live), "live");
        assert_eq!(state_to_string(&CompetitionState::Scoring), "scoring");
        assert_eq!(state_to_string(&CompetitionState::Settled), "settled");
    }

    #[test]
    fn test_display_trait() {
        assert_eq!(format!("{}", CompetitionState::Upcoming), "upcoming");
        assert_eq!(format!("{}", CompetitionState::Live), "live");
    }

    #[test]
    fn test_roundtrip_parse_string() {
        for state in [
            CompetitionState::Upcoming,
            CompetitionState::Live,
            CompetitionState::Scoring,
            CompetitionState::Settled,
        ] {
            let s = state_to_string(&state);
            let parsed = parse_state(s).unwrap();
            assert_eq!(parsed, state);
        }
    }
}
