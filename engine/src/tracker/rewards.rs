//! Dungeons, duty missions and what they and chests give: runs starting and cleared, reward boards, boxes opened, loot.
//! Read by `Tracker::frame` (mod.rs), each message as the game sends it.

use super::*;

impl Tracker {
    /// Handles `op` if it is one of these messages: false when it is not.
    pub(super) fn rewards_frame(&mut self, op: [u8; 2], ts: i64, f: &[u8]) -> bool {
        match op {
            p::OP_DUNGEON_START => {
                if let Some(zone) = p::dungeon_start(f) {
                    (self.emit)(json!({ "type": "dungeonStart", "ts": ts, "zone": zone }));
                }
            }
            p::OP_DUNGEON_CLEAR => {
                if let Some(zone) = p::dungeon_clear(f) {
                    tracing::info!("dungeon cleared: {zone}");
                    (self.emit)(json!({ "type": "dungeonClear", "ts": ts, "zone": zone }));
                }
            }
            p::OP_NIGHTMARE_START => {
                if let Some((boss, level)) = p::nightmare_start(f) {
                    (self.emit)(json!({ "type": "nightmare", "ts": ts, "boss": boss, "level": level }));
                }
            }
            p::OP_NIGHTMARE_END => {
                let raw: String = f.iter().map(|b| format!("{b:02x}")).collect();
                tracing::info!("nightmare ended: {raw}");
            }
            p::OP_REWARD_BOARD => {
                if let Some(entries) = p::reward_board(f) {
                    let entries: Vec<Value> = entries
                        .into_iter()
                        .map(|(name, items)| json!({ "name": name, "items": items.into_iter().map(|(item, amount)| json!({ "item": item, "amount": amount })).collect::<Vec<_>>() }))
                        .collect();
                    tracing::info!("reward board: {entries:?}");
                    (self.emit)(json!({ "type": "rewardBoard", "ts": ts, "entries": entries }));
                } else {
                    let raw: String = f.iter().map(|b| format!("{b:02x}")).collect();
                    tracing::info!("reward board not read: {raw}");
                }
            }
            p::OP_DUTY_OPEN | p::OP_DUTY_REROLL => self.duty_opened_at = ts,
            p::OP_DUTY_TAKEN => {
                self.duty_opened_at = ts;
                if let Some(mission) = p::duty_taken(f) {
                    tracing::info!("duty mission taken: {mission:?}");
                    (self.emit)(json!({ "type": "dutyTaken", "ts": ts, "quest": mission.0, "place": mission.1 }));
                    self.duty_known(ts, vec![mission]);
                }
            }
            p::OP_DUTY_BOARD => {
                let missions = p::duty_board(f);
                self.duty_known(ts, missions);
                // All of it, the offered missions too: the dashboard's Duty board.
                if let Some(board) = p::duty_board_full(f) {
                    let missions: Vec<Value> = board
                        .missions
                        .into_iter()
                        .map(|(quest, place, rewards)| {
                            let rewards: Vec<Value> = rewards.into_iter().map(|(item, amount, chance)| json!({ "item": item, "amount": amount, "chance": chance })).collect();
                            json!({ "quest": quest, "place": place, "rewards": rewards })
                        })
                        .collect();
                    // Looked at: right after you opened it, rerolled it or took a mission; not the one sent as you log in.
                    let opened = ts - self.duty_opened_at <= 2000;
                    (self.emit)(json!({ "type": "dutyBoard", "ts": ts, "opened": opened, "rerolls": board.rerolls, "expires": board.expires_ms, "missions": missions }));
                }
            }
            p::OP_DUTY_DONE => {
                self.duty_opened_at = ts;
                if let Some((place, indexes)) = p::duty_done(f) {
                    self.duty_done(ts, place, indexes);
                }
            }
            p::OP_BOX_OPENED => {
                if let Some(items) = p::box_opened(f) {
                    // Its bytes too: a box's contents vary (equipment...), what was not read shows.
                    let raw: String = f.iter().map(|b| format!("{b:02x}")).collect();
                    tracing::info!("box opened: {items:?} ({raw})");
                    let items: Vec<Value> = items.into_iter().map(|(item, spent, amount)| json!({ "item": item, "spent": spent, "amount": amount })).collect();
                    (self.emit)(json!({ "type": "boxOpened", "ts": ts, "items": items }));
                } else {
                    let raw: String = f.iter().map(|b| format!("{b:02x}")).collect();
                    tracing::info!("box opened not read: {raw}");
                }
            }
            p::OP_EXPEDITIONS => {
                if let Some(list) = p::expeditions(f) {
                    let entries: Vec<Value> = list.into_iter().map(|(world, cubes, flag)| json!({ "world": world, "cubes": cubes, "flag": flag })).collect();
                    tracing::info!("expeditions: {entries:?}");
                    (self.emit)(json!({ "type": "expeditions", "ts": ts, "entries": entries }));
                } else {
                    let raw: String = f.iter().map(|b| format!("{b:02x}")).collect();
                    tracing::info!("expeditions not read: {raw}");
                }
            }
            p::OP_LOOT => {
                if let Some((source, items)) = p::loot(f) {
                    let items: Vec<Value> = items.into_iter().map(|(item, amount)| json!({ "item": item, "amount": amount })).collect();
                    tracing::info!("loot ({source}): {items:?}");
                    (self.emit)(json!({ "type": "loot", "ts": ts, "source": source, "items": items }));
                }
            }
            _ => return false,
        }
        true
    }
}
