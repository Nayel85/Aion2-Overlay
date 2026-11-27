//! Other players: their spawn, card, target info, legion and PvP; join requests.

use super::*;

/// A player coming into view: `45 36 <entity varint> <4 bytes> 17 <len><name>
/// <u32> <faction u8> ...`, and some 100-120 bytes on `<server u16> <2 bytes>
/// 00 00 00 00 <server u16> <len><legion>` (Nyerk 0.2.17). The faction byte is
/// 1 Elyos, 2 Asmodian, as the server's thousands are (1406 Elyos, 2406
/// Asmodian: the 2026-10-21 and 10-25 packet logs).
#[derive(Debug, Clone, PartialEq)]
pub struct Player {
    pub entity: u32,
    pub name: String,
    pub server: Option<u16>,
    pub legion: Option<String>,
    /// 1 Elyos, 2 Asmodian: the server's, else the byte after the name's u32.
    pub faction: Option<u8>,
    /// The u32 right after the name: the class number (`roster_class`), as target info has it.
    pub class: Option<u32>,
    /// Where they stand, game (x, y): 8 bytes after the name (all 8 players of the 2026-10
    /// captures; Wolf's matched his effects' position to the unit).
    pub place: Option<(f32, f32)>,
    /// Their combat power, as the game shows it (`spawn_combat_power`).
    pub combat_power: Option<u32>,
    /// Their PvP switched on as they came into view: bit 02 of the fourth byte after the entity.
    /// Set on Coby, Tributação and RazielGT (PvP on, fought), clear on ZergBR and FAT (off): the
    /// owner's 2026-10-26 and 10-28 logs. SophieGreen, Zuharïs and Yamiel came in with it clear and
    /// switched it on in view (`pvp_switch`) before their fights. Later switches come as `54 36`.
    pub pvp: bool,
    /// Where they stand everyone can fight, PvP switched on or not (the Abyss): bit 10 of the
    /// fifth byte after the entity, the one before the name's length. 17 in every spawn of the
    /// owner's Abyss logs (2026-10-26 15:07-15:42, 10-27 02:23), 07 in all of the Altgard ones.
    pub open_pvp: bool,
}

pub const ELYOS: u8 = 1;
pub const ASMODIAN: u8 = 2;

/// A server's faction: 1xxx Elyos, 2xxx Asmodian.
pub fn server_faction(server: u16) -> Option<u8> {
    match server / 1000 {
        1 => Some(ELYOS),
        2 => Some(ASMODIAN),
        _ => None,
    }
}

pub fn player(frame: &[u8]) -> Option<Player> {
    let b = body(frame, OP_PLAYER)?;
    let (entity, pos) = varint(b, 0)?;
    let (name, at, end) = (pos..(pos + 12).min(b.len())).find_map(|p| {
        let name = name_at(b, p)?;
        let end = p + 1 + name.len();
        Some((name, p, end))
    })?;
    let mut server = None;
    let mut legion = None;
    for k in end + 40..(end + 200).min(b.len().saturating_sub(10)) {
        let v = u16_at(b, k)?;
        if (1000..=9999).contains(&v) && b[k + 4..k + 8] == [0, 0, 0, 0] && u16_at(b, k + 8) == Some(v) {
            server = Some(v);
            legion = text(b, k + 10, 48).map(|(s, _)| s);
            break;
        }
    }
    let server = server.or_else(|| unguilded_server(b, end));
    let faction = server.and_then(server_faction).or_else(|| b.get(end + 4).copied().filter(|f| [ELYOS, ASMODIAN].contains(f)));
    let class = u32_at(b, end).filter(|&c| roster_class(c).is_some());
    let place = place_at(b, end + 8);
    let combat_power = spawn_combat_power(b, end);
    let pvp = at == pos + 5 && b[pos + 3] & 0x02 != 0;
    let open_pvp = at == pos + 5 && b[pos + 4] & 0x10 != 0;
    Some(Player { entity, name, server, legion, faction, class, place, combat_power, pvp, open_pvp })
}

/// What every item of a player's gear in their spawn ends with.
pub(super) const SPAWN_ITEM_TAIL: [u8; 14] = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x80, 0x75, 0xd5, 0x2a, 0xbb, 0x03];

/// The server of a player in no legion: there, the server is not repeated around a legion's name
/// but sits once before their gear, `<server u16> <count u8> <10, 11 or 13> ...`, the first such
/// past the stats with the faction the spawn states (Dæps 2406 and Elyos of the 2026-10-26 logs).
pub(super) fn unguilded_server(b: &[u8], name_end: usize) -> Option<u16> {
    let faction = *b.get(name_end + 4)?;
    let tail = name_end + b.get(name_end..)?.windows(SPAWN_ITEM_TAIL.len()).position(|w| w == SPAWN_ITEM_TAIL)?;
    (name_end + 40..tail.saturating_sub(4))
        .filter(|&k| (1..=40).contains(&b[k + 2]) && [0x10, 0x11, 0x13].contains(&b[k + 3]))
        .find_map(|k| u16_at(b, k).filter(|&v| server_faction(v) == Some(faction)))
}

/// The mark the combat power follows in a player's spawn, at its last place after the name.
pub(super) const SPAWN_CP_MARK: [u8; 3] = [0xf4, 0xcb, 0x1f];

/// A spawn's combat power: after the last `f4 cb 1f` past the name, two u32, sometimes one more
/// byte, then the combat power as a u64 (and a byte, mostly 0: 1 and 2 seen too). Taken only when the two readings (with
/// and without that byte) agree on one believable value. From another overlay's author (MarceUY,
/// `FindSpawnCombatPower`), checked on SquarX in the owner's 2026-10-26 log: 115485, shown 115.4k.
pub(super) fn spawn_combat_power(b: &[u8], name_end: usize) -> Option<u32> {
    let rest = b.get(name_end..)?;
    let mark = name_end + rest.windows(3).rposition(|w| w == SPAWN_CP_MARK)?;
    let read = |at: usize| u64_at(b, at).filter(|v| (1_000..=10_000_000).contains(v));
    let at = mark + 3 + 8;
    match (read(at), read(at + 1)) {
        (Some(a), Some(b)) if a != b => None,
        (a, b) => a.or(b).map(|v| v as u32),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlayerCard {
    pub name: String,
    pub server: u16,
    /// The class number (`roster_class`).
    pub class: u32,
    pub level: u32,
    pub gear_score: u32,
    pub combat_power: u32,
}

/// `30 97 <character u32> 00 00 <server u16> <class u32> <level u32> <gear score u32>
/// <len><name> <server u16> 00 00 00 00 <combat power u32> ...`: a player's
/// card, its numbers as the game shows them (Shiggly 1406, Lv45, 2630 gear
/// score, 123186 combat power: the owner's 2026-10-26 packet log). The
/// character id is not the one players in view go by: the card is matched by
/// name and server.
pub fn player_card(frame: &[u8]) -> Option<PlayerCard> {
    let b = body(frame, OP_PLAYER_CARD)?;
    card_at(b).map(|(_, card)| card)
}

/// A card's fields from `character u32` on, as `player_card` lays them out: the character id and the card.
pub(super) fn card_at(b: &[u8]) -> Option<(u32, PlayerCard)> {
    let server = u16_at(b, 6)?;
    let level = u32_at(b, 12)?;
    let gear_score = u32_at(b, 16)?;
    let name = name_at(b, 20)?;
    let end = 21 + name.len();
    let valid = (1000..=9999).contains(&server) && (1..=99).contains(&level) && gear_score < 100_000 && u16_at(b, end) == Some(server);
    valid.then_some((u32_at(b, 0)?, PlayerCard { name, server, class: u32_at(b, 8)?, level, gear_score, combat_power: u32_at(b, end + 6)? }))
}

/// Someone asking to join your party: `07 97 <group u32>` and then the same card as `30 97`
/// (the character id first). Sent for every applicant as they apply, though the game shows only
/// the first until it is answered (the owner's 2026-11-22 logs: Tadalafila, CP 66513, GS 1446,
/// while the game showed another).
pub fn applicant(frame: &[u8]) -> Option<(u32, PlayerCard)> {
    card_at(body(frame, OP_APPLICANT)?.get(4..)?)
}

/// `25 97 <character u32> 00 00 <server u16>`: an application gone (seen once, an applicant
/// 15 s after applying; a cancel is assumed). Accepting or rejecting one sends none, and the
/// ones who cancelled (Hasagi, Biaa) left no message in the 2026-11-22 log.
pub fn applicant_gone(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_APPLICANT_GONE)?;
    (b.len() == 8 && u16_at(b, 4)? == 0 && (1000..=9999).contains(&u16_at(b, 6)?)).then(|| u32_at(b, 0))?
}

/// `0B 97 0C <slot u8> <character u32> ...`: a member who joined your party (the same character
/// id an application carries).
pub fn member_joined(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_MEMBER_JOINED)?;
    (b.first() == Some(&0x0C)).then(|| u32_at(b, 2))?
}

/// `54 36 <entity varint> <01 on | 00 off>`: a player in view (you too) switching their PvP. Seen
/// on: you, then SophieGreen, Zuharïs and Yamiel a few seconds before their fights (the owner's
/// 2026-10-26 23:02 log). Off is assumed to be 00, not seen yet.
pub fn pvp_switch(frame: &[u8]) -> Option<(u32, bool)> {
    let b = body(frame, OP_PVP_SWITCH)?;
    let (entity, n) = varint(b, 0)?;
    match b.get(n..)? {
        [on] if *on <= 1 => Some((entity, *on == 1)),
        _ => None,
    }
}

/// `47 36 <entity varint> <reason u16>`: a player out of your view (out of
/// range 01, 02, a teleport 0a...). In every capture so far it follows only
/// players' `45 36`, never a monster's (those leave with `42 36`).
pub fn player_gone(frame: &[u8]) -> Option<u32> {
    let b = body(frame, OP_PLAYER_GONE)?;
    let (entity, n) = varint(b, 0)?;
    (b.len() >= n + 2).then_some(entity)
}

/// A class by the number party records and target info carry: four values a class, which differ
/// by something else about the character (A2Tools' `JobClass::from_roster_class`, matched
/// against 14 players; Wolf's 13 and Shiggly's 14 both Rangers, as the owner confirmed). Named as
/// the meter names them.
pub fn roster_class(value: u32) -> Option<&'static str> {
    Some(match value {
        5..=8 => "Gladiator",
        9..=12 => "Templar",
        13..=16 => "Ranger",
        17..=20 => "Assassin",
        21..=24 => "Spiritmaster",
        25..=28 => "Sorcerer",
        29..=32 => "Cleric",
        33..=36 => "Chanter",
        _ => return None,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct TargetInfo {
    pub name: String,
    pub server: u16,
    pub level: u32,
    pub gear_score: u32,
    /// The class number (`roster_class`).
    pub class: u32,
    pub legion: Option<String>,
    /// As read: the tracker keeps only believable values (`steady_cp`).
    pub combat_power: u32,
}

/// The combat power's place in target info: this many bytes before the end of the body.
pub(super) const TARGET_CP_FROM_END: usize = 33;

/// `50 36 00 00 <u8> <len><name> <class u32> 01 01 <level u32> <u32> <gear score
/// u32> <server u16> <server u16> ... <server u16> <len><legion> ... <combat
/// power u32> <29 bytes>`, some 3 KB: a player you target, their sheet as the
/// game shows it (Wolf 1406, Lv45, 2429 gear score, 125122 combat power, the
/// owner's 2026-10-26 packet log). Read from one capture: the combat power is
/// where it was there, counted from the end.
pub fn target_info(frame: &[u8]) -> Option<TargetInfo> {
    let b = body(frame, OP_TARGET_INFO)?;
    let (name, at) = (2..6).find_map(|p| name_at(b, p).map(|n| (n, p)))?;
    let end = at + 1 + name.len();
    let class = u32_at(b, end)?;
    let level = u32_at(b, end + 6)?;
    let gear_score = u32_at(b, end + 14)?;
    // Their home server, then the one they are on: not the same for one visiting yours (Arïse of
    // 2307 on 1305, 2026-11-23); the home one is theirs.
    let server = u16_at(b, end + 18)?;
    let here = u16_at(b, end + 20)?;
    if !(1000..=9999).contains(&server) || !(1000..=9999).contains(&here) || !(1..=99).contains(&level) || gear_score >= 100_000 {
        return None;
    }
    let legion = (end + 22..(end + 60).min(b.len().saturating_sub(2)))
        .find(|&k| u16_at(b, k) == Some(server))
        .and_then(|k| text(b, k + 2, 48))
        .map(|(s, _)| s)
        .filter(|s| !s.is_empty());
    let combat_power = u32_at(b, b.len().checked_sub(TARGET_CP_FROM_END)?)?;
    Some(TargetInfo { name, server, level, gear_score, class, legion, combat_power })
}

/// `33 8A <entity varint> <legion id u48> <server u16> <len><name>`: a player's
/// legion, yours included, resent every few seconds (Nyerk 0.2.17).
pub fn legion(frame: &[u8]) -> Option<(u32, String)> {
    let b = body(frame, OP_LEGION)?;
    let (entity, n) = varint(b, 0)?;
    let server = u16_at(b, n + 6)?;
    let (name, _) = text(b, n + 8, 48)?;
    (1000..=9999).contains(&server).then_some((entity, name))
}
