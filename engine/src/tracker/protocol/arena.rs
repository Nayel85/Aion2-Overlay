//! An arena's match: its players, each kill, and the score it changed.

use super::*;

/// An arena's players: `(id, name)` each, found as `<id u32> 00 00 <server u16> <len u8> <name>` (the
/// fields between them not read).
pub fn arena_players(frame: &[u8]) -> Vec<(u32, String)> {
    let Some(b) = body(frame, OP_ARENA_PLAYERS) else { return Vec::new() };
    let mut out = Vec::new();
    let mut at = 0;
    while at + 9 < b.len() {
        let len = b[at + 8] as usize;
        let name = b.get(at + 9..at + 9 + len).filter(|_| b[at + 4] == 0 && b[at + 5] == 0 && (3..=16).contains(&len));
        match name.and_then(|n| std::str::from_utf8(n).ok()).filter(|n| n.chars().all(|c| c.is_alphanumeric())) {
            Some(name) => {
                out.push((u32_at(b, at).unwrap_or(0), name.to_string()));
                at += 9 + len;
            }
            None => at += 1,
        }
    }
    out
}

/// An arena's kill: the killer's id and the victim's.
pub fn arena_kill(frame: &[u8]) -> Option<(u32, u32)> {
    let b = body(frame, OP_ARENA_KILL)?;
    Some((u32_at(b, 0)?, u32_at(b, 8)?))
}

/// An arena's score update: which of `players` it names (by their ids in it).
pub fn arena_scored(frame: &[u8], players: &[u32]) -> Vec<u32> {
    let Some(b) = body(frame, OP_ARENA_SCORE) else { return Vec::new() };
    players.iter().copied().filter(|id| b.windows(6).any(|w| w[..4] == id.to_le_bytes() && w[4..] == [0, 0])).collect()
}
