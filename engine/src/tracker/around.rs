//! What is around you: where you are (your moves, the misread jumps left out), the Hidden Cubes in view.
//! Methods of `Tracker` (mod.rs), called from its `frame` as the messages come.

use super::*;

impl Tracker {
    /// The cubes in view, as the overlay shows them: where (the map data's x, -y), how high,
    /// and since when they exist.
    pub fn cubes(&self) -> Value {
        let mut list: Vec<&p::ObjectSpawn> = self.cubes.values().collect();
        list.sort_by_key(|c| c.id);
        Value::Array(
            list.into_iter()
                .map(|c| {
                    json!({
                        "id": c.id, "template": c.template, "position": [c.x.round() as i64, (-c.y).round() as i64],
                        "height": c.z.round() as i64, "createdAt": c.created_ms,
                    })
                })
                .collect(),
        )
    }

    pub(super) fn cubes_changed(&self, ts: i64) {
        (self.emit)(json!({ "type": "cubes", "ts": ts, "cubes": self.cubes() }));
    }

    pub(super) fn clear_cubes(&mut self) {
        if !self.cubes.is_empty() {
            self.cubes.clear();
            (self.emit)(json!({ "type": "cubes", "cubes": [] }));
        }
    }

    /// You are at game (x, y): kept as the map data's (x, -y).
    pub(super) fn move_to(&mut self, ts: i64, x: f32, y: f32, exact: bool) {
        self.position = Some((x, -y));
        self.position_ms = ts;
        self.position_exact = exact;
        self.nearby_dirty = true;
    }

    /// Game (x, y) is too far from your last place for the time since: a misread.
    pub(super) fn jump(&self, ts: i64, x: f32, y: f32) -> bool {
        let dt = ts - self.position_ms;
        let Some((px, py)) = self.position else { return false };
        dt < MAX_JUMP_MS && ((px - x).hypot(py + y)) > MAX_SPEED * (dt.max(50) as f32 / 1000.0)
    }

    pub fn nearby(&mut self) -> Value {
        self.nearby_dirty = false;
        let mut counts: HashMap<u32, u32> = HashMap::new();
        for code in self.visible.values() {
            *counts.entry(*code).or_default() += 1;
        }
        let mut monsters: Vec<(u32, u32)> = counts.into_iter().collect();
        monsters.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        json!({
            "world": self.world,
            "position": self.position.map(|(x, y)| [x.round() as i64, y.round() as i64]),
            "monsters": monsters.into_iter().map(|(npc, count)| json!({ "npc": npc, "count": count })).collect::<Vec<_>>(),
        })
    }
}
