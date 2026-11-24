//! Your party: its members' vitals, who asks to join it and who joins.
//! Read by `Tracker::frame` (mod.rs), each message as the game sends it.

use super::*;

impl Tracker {
    /// Handles `op` if it is one of these messages: false when it is not.
    pub(super) fn party_frame(&mut self, op: [u8; 2], ts: i64, f: &[u8]) -> bool {
        match op {
            p::OP_PARTY_VITALS => {
                if let Some((entity, hp, max_hp, fp, max_fp)) = p::party_vitals(f) {
                    (self.emit)(json!({ "type": "partyVitals", "ts": ts, "entity": entity, "hp": hp, "maxHp": max_hp, "flight": fp, "maxFlight": max_fp }));
                }
            }
            p::OP_APPLICANT => {
                if let Some((character, card)) = p::applicant(f) {
                    (self.emit)(json!({
                        "type": "applicant", "ts": ts, "character": character, "name": card.name, "server": card.server,
                        "className": p::roster_class(card.class), "level": card.level, "gearScore": card.gear_score, "combatPower": card.combat_power,
                    }));
                }
            }
            p::OP_APPLICANT_GONE => {
                if let Some(character) = p::applicant_gone(f) {
                    (self.emit)(json!({ "type": "applicantGone", "ts": ts, "character": character }));
                }
            }
            p::OP_MEMBER_JOINED => {
                if let Some(character) = p::member_joined(f) {
                    (self.emit)(json!({ "type": "applicantGone", "ts": ts, "character": character }));
                }
            }
            _ => return false,
        }
        true
    }
}
