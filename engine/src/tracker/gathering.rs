//! Gathering, crafting and supply requests: each one's start (its outcome already known), its end and what it gave.
//! Read by `Tracker::frame` (mod.rs), each message as the game sends it.

use super::*;

impl Tracker {
    /// Handles `op` if it is one of these messages: false when it is not.
    pub(super) fn gathering_frame(&mut self, op: [u8; 2], ts: i64, f: &[u8]) -> bool {
        match op {
            p::OP_CRAFT_START => {
                if let Some((recipe, outcome, ms)) = p::craft_start(f) {
                    tracing::info!("craft {recipe}: will be {outcome}");
                    self.craft = Some(recipe);
                    (self.emit)(json!({ "type": "craftStart", "ts": ts, "recipe": recipe, "outcome": outcome, "durationMs": ms }));
                }
            }
            p::OP_CRAFT_DONE => {
                if let Some(recipe) = self.craft.take() {
                    self.craft_done = Some((recipe, ts));
                    // Done, made or failed: a failed one puts nothing in the bags (no craftResult).
                    (self.emit)(json!({ "type": "craftDone", "ts": ts, "recipe": recipe }));
                }
            }
            p::OP_INTERACTION_OVER => {
                if let Some(object) = p::interaction_over(f)
                    && self.gathering == Some(object)
                {
                    self.gathering = None;
                    (self.emit)(json!({ "type": "gatherEnd", "ts": ts, "node": object }));
                }
            }
            p::OP_GATHER_START => {
                if let Some((node, tries, outcome, grade, doubled, ms, rolls)) = p::gather_start(f) {
                    tracing::info!("gathering {node} (try {tries}): will be {outcome}, grade {grade}, doubled {doubled}");
                    // Its bytes, to read what a new skill or outcome looks like without a packet log.
                    tracing::info!("gathering start: {}", f.iter().map(|b| format!("{b:02x}")).collect::<String>());
                    self.gathering = Some(node);
                    let template = self.objects.get(&node).copied();
                    (self.emit)(json!({ "type": "gatherStart", "ts": ts, "node": node, "template": template, "try": tries, "outcome": outcome, "grade": grade, "doubled": doubled, "durationMs": ms,
                        "rolls": rolls.iter().map(|r| json!({ "ms": r.ms, "success": r.success, "failure": r.failure, "luck": r.luck, "doubled": r.doubled, "skills": r.skills })).collect::<Vec<_>>() }));
                }
            }
            p::OP_GATHER => {
                if let Some((result, item, amount, bonus)) = p::gather(f) {
                    tracing::info!("gathered: {amount} + {bonus} x {item} (result {result})");
                    (self.emit)(json!({ "type": "gather", "ts": ts, "item": item, "amount": amount, "bonus": bonus, "result": result }));
                }
            }
            p::OP_SUPPLY_DONE => {
                // A supply request handed in (its id the second number).
                if let Some((request, rewards)) = p::supply_done(f) {
                    tracing::info!("supply request {request} handed in: {rewards:?}");
                    let rewards: Vec<Value> = rewards.iter().map(|(item, amount)| json!({ "item": item, "amount": amount })).collect();
                    (self.emit)(json!({ "type": "supplyDone", "ts": ts, "request": request, "rewards": rewards }));
                }
            }
            _ => return false,
        }
        true
    }
}
