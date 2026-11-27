//! A character logging in: who it is, its wallet and Abyss Points, its subscriptions and counters.
//! Methods of `Tracker` (mod.rs), called from its `frame` as the messages come.

use super::*;

impl Tracker {
    /// A character entered the world. Collections are per server: a character
    /// on another server than the last one plays that server's collection.
    pub(super) fn character_seen(&mut self, ts: i64, who: p::Character) {
        let old_key = self.store.key();
        let old = self.store.current.replace(who.name.clone());
        self.store.characters.entry(who.name.clone()).or_default().server = Some(who.server);
        self.store.adopt_unknown();
        let changed = old.as_deref() != Some(who.name.as_str()) || old_key != self.store.key();
        if changed {
            // Another character, maybe on the other side: who counts as an enemy changes.
            self.clear_enemies(ts);
            // The last character's Hidden Cubes are not this one's (the same zone keeps them otherwise).
            self.clear_cubes();
            self.save();
            tracing::info!("character: {} on {}{}", who.name, who.server, old.as_ref().map(|o| format!(" (was {o})")).unwrap_or_default());
            (self.emit)(json!({
                "type": "character", "ts": ts, "name": who.name, "server": who.server,
                "switched": old.is_some(), "pets": self.snapshot(),
            }));
        }
        if let (Some(class), Some(level), Some(gear_score)) = (who.class, who.level, who.gear_score) {
            let stats = (who.name.clone(), class, level, gear_score);
            if self.me_stats.as_ref() != Some(&stats) {
                (self.emit)(json!({
                    "type": "me", "ts": ts, "name": who.name, "server": who.server, "classId": class,
                    "className": p::roster_class(class), "level": level, "gearScore": gear_score,
                }));
                self.me_stats = Some(stats);
            }
        }
        if self.pending_counters.is_some() {
            self.counters_read(&who.name, Some(who.server));
        }
        if self.pending_subscriptions.is_some() {
            self.subscriptions_read(&who.name, Some(who.server));
        }
        if self.pending_wallet.is_some() {
            self.wallet_read(&who.name, Some(who.server));
        }
        if let Some((_, coll)) = self.pending_sync.take() {
            self.sync(ts, &coll);
        }
        if self.pending_abyss.is_some() {
            self.abyss_read(Some(who.name));
        }
    }

    /// The Abyss Points total waiting, as `name`'s: what it gained over that character's last
    /// total. The first known total, a lower one (the weekly reset) or a jump past ABYSS_MAX_GAIN
    /// is only a new start.
    pub(super) fn abyss_read(&mut self, name: Option<String>) {
        let Some((ts, points, limit)) = self.pending_abyss.take() else { return };
        let gained = match &name {
            Some(name) => {
                let entry = self.store.characters.entry(name.clone()).or_default();
                let gained = entry.abyss_points.map_or(0, |last| points.saturating_sub(last));
                let gained = if gained > ABYSS_MAX_GAIN { 0 } else { gained };
                if entry.abyss_points != Some(points) {
                    entry.abyss_points = Some(points);
                    self.save();
                }
                gained
            }
            None => 0,
        };
        if gained > 0 {
            tracing::debug!("abyss points: +{gained} ({points} of {limit})");
        }
        (self.emit)(json!({ "type": "abyss", "ts": ts, "name": name, "points": points, "limit": limit, "gained": gained }));
    }

    /// The Abyss Points balance (`1b 56`): each rise is a gain, by character. The first balance seen
    /// is only a start, and a jump past ABYSS_MAX_GAIN (a mailbox, a quest chest) is not farming.
    pub(super) fn abyss_wallet(&mut self, ts: i64, balance: u64) {
        let Some(name) = self.store.current.clone() else { return };
        let before = self.abyss_balance.insert(name.clone(), balance);
        let gained = before.map_or(0, |b| balance.saturating_sub(b));
        if gained > 0 && gained <= ABYSS_MAX_GAIN {
            (self.emit)(json!({ "type": "abyssGain", "ts": ts, "name": name, "gained": gained, "balance": balance }));
        }
    }

    /// The login's Kina and bound Kina, for `name`.
    pub(super) fn wallet_read(&mut self, name: &str, server: Option<u16>) {
        let Some((at, kina, bound)) = self.pending_wallet.take() else { return };
        let balances: serde_json::Map<String, Value> = std::mem::take(&mut self.pending_balances).into_iter().map(|(id, v)| (id.to_string(), json!(v))).collect();
        let week = self.pending_week.take();
        (self.emit)(json!({ "type": "wallet", "ts": at, "name": name, "server": server, "kina": kina, "boundKina": bound, "balances": balances, "seasonWeek": week }));
        // And everything they have, where it lies (the Inventory page).
        let items: Vec<Value> = std::mem::take(&mut self.pending_depot).iter().map(depot_json).collect();
        if !items.is_empty() {
            (self.emit)(json!({ "type": "inventory", "ts": at, "name": name, "server": server, "items": items }));
        }
    }

    /// The subscriptions, for `name`: each id and when it ends (the app knows which are memberships).
    pub(super) fn subscriptions_read(&mut self, name: &str, server: Option<u16>) {
        let Some((at, list)) = self.pending_subscriptions.take() else { return };
        let list: Vec<Value> = list.into_iter().map(|(id, end)| json!({ "id": id, "end": end })).collect();
        (self.emit)(json!({ "type": "subscriptions", "ts": at, "name": name, "server": server, "list": list }));
    }

    /// The login's counters, for `name`: by id, their values (the app knows which is which).
    pub(super) fn counters_read(&mut self, name: &str, server: Option<u16>) {
        let Some((at, list)) = self.pending_counters.take() else { return };
        let values: serde_json::Map<String, Value> = list.into_iter().map(|(id, v)| (id.to_string(), json!(v))).collect();
        // When the game sent them: the changes since come after.
        (self.emit)(json!({ "type": "counters", "ts": at, "name": name, "server": server, "values": values }));
        for (ts, id, values) in std::mem::take(&mut self.pending_counter) {
            (self.emit)(json!({ "type": "counter", "ts": ts, "name": name, "server": server, "id": id.to_string(), "values": values }));
        }
    }
}
