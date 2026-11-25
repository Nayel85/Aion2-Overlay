//! The pet tables the tracker needs, from the app's own copies (questlog.gg's
//! data, built into the engine so there is one source): which ids are pets,
//! each pet's genus, and which pet each monster drops souls of.

use std::collections::HashMap;
use std::sync::OnceLock;

const PETS: &str = include_str!("../../../app/src/renderer/src/data/pets.json");
const SPAWNS: &str = include_str!("../../../app/src/renderer/public/maps/spawns.json");
const FIELD_BOSS_NPCS: &str = include_str!("../../../app/src/shared/fieldBossNpcs.json");

pub struct PetData {
    /// pet -> genus ("fera", "cogni", "natura", "varian", "special")
    pub genus: HashMap<u32, String>,
    /// monster code -> the pet whose souls it drops (each monster drops one)
    pub droppers: HashMap<u32, u32>,
}

impl PetData {
    pub fn is_pet(&self, id: u32) -> bool {
        self.genus.contains_key(&id)
    }
}

pub fn pets() -> &'static PetData {
    static DATA: OnceLock<PetData> = OnceLock::new();
    DATA.get_or_init(|| {
        let pets: serde_json::Value = serde_json::from_str(PETS).unwrap_or_default();
        let genus = pets["pets"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| Some((p["id"].as_u64()? as u32, p["genus"].as_str().unwrap_or_default().to_string())))
            .collect();
        let spawns: serde_json::Value = serde_json::from_str(SPAWNS).unwrap_or_default();
        let droppers = spawns["pets"]
            .as_object()
            .into_iter()
            .flatten()
            .flat_map(|(pet, list)| {
                let pet: u32 = pet.parse().unwrap_or_default();
                list.as_array().into_iter().flatten().filter_map(move |d| Some((d["npc"].as_u64()? as u32, pet)))
            })
            .collect();
        PetData { genus, droppers }
    })
}


/// The field bosses' monster codes (the app's fieldBossNpcs.json, by their id in the map's list):
/// one dying in view is told at once (`bossKilled`), for the Boss Runs list.
pub fn field_boss_npcs() -> &'static std::collections::HashSet<u32> {
    static DATA: OnceLock<std::collections::HashSet<u32>> = OnceLock::new();
    DATA.get_or_init(|| {
        let table: serde_json::Value = serde_json::from_str(FIELD_BOSS_NPCS).unwrap_or_default();
        table["npcs"].as_object().into_iter().flatten().filter_map(|(_, npc)| u32::try_from(npc.as_u64()?).ok()).collect()
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_tables_load() {
        let data = super::pets();
        assert!(data.genus.len() > 200, "{}", data.genus.len());
        assert!(data.is_pet(1006) && !data.is_pet(77298));
        // Krall Armed Soldier drops Pet 1002's souls.
        assert_eq!(data.droppers.get(&2100075), Some(&1002));
    }

    #[test]
    fn the_field_bosses_are_the_apps_table() {
        let npcs = super::field_boss_npcs();
        // Verteron's 24, Altgard's 24, the Abyss's 8.
        assert_eq!(npcs.len(), 56);
        assert!(npcs.contains(&2_100_003) && npcs.contains(&2_400_017) && npcs.contains(&2_600_068));
    }
}
