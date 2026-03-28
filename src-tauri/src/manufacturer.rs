use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub enum Manufacturer {
    Riedel,
    AudinateDante,
    Yamaha,
    Merging,
    Lawo,
    DirectOut,
    TelosAxia,
    Digigram,
    Ross,
    Unknown,
}

impl Manufacturer {
    pub fn to_string(&self) -> String {
        match self {
            Manufacturer::Riedel => "Riedel".to_string(),
            Manufacturer::AudinateDante => "Audinate/Dante".to_string(),
            Manufacturer::Yamaha => "Yamaha".to_string(),
            Manufacturer::Merging => "Merging".to_string(),
            Manufacturer::Lawo => "Lawo".to_string(),
            Manufacturer::DirectOut => "DirectOut".to_string(),
            Manufacturer::TelosAxia => "Telos/Axia".to_string(),
            Manufacturer::Digigram => "Digigram".to_string(),
            Manufacturer::Ross => "Ross Video".to_string(),
            Manufacturer::Unknown => "Unknown".to_string(),
        }
    }

    pub fn default_timeout_ms(&self, unknown_timeout_s: u64) -> u64 {
        match self {
            Manufacturer::Riedel => 12_000,
            Manufacturer::AudinateDante => 35_000,
            Manufacturer::Yamaha => 35_000,
            Manufacturer::Merging => 30_000,
            Manufacturer::Lawo => 30_000,
            Manufacturer::DirectOut => 30_000,
            Manufacturer::Digigram => 30_000,
            Manufacturer::TelosAxia => 30_000,
            Manufacturer::Ross => 30_000,
            Manufacturer::Unknown => unknown_timeout_s.max(60) * 1000,
        }
    }
}

pub fn identify_manufacturer(mac: &str) -> Manufacturer {
    // Standardize MAC: remove punctuation and uppercase
    let clean_mac = mac.replace(|c: char| !c.is_alphanumeric(), "").to_uppercase();
    if clean_mac.len() < 6 {
        return Manufacturer::Unknown;
    }
    let oui = &clean_mac[0..6];

    match oui {
        // RIEDEL
        "001F4C" | "0019A7" | "0030F7" | "3408BC" => Manufacturer::Riedel,
        // AUDINATE / DANTE
        "001DC1" | "000E5C" | "001899" | "B046FC" | "4C4E35" | "9C8ECD" => Manufacturer::AudinateDante,
        // YAMAHA
        "00A0DE" | "540D0F" | "AC9E17" => Manufacturer::Yamaha,
        // MERGING
        "001F7D" | "001607" | "D067E5" => Manufacturer::Merging,
        // LAWO
        "001DA1" | "000A5E" | "949F3E" => Manufacturer::Lawo,
        // DIRECTOUT
        "001C6A" | "40D03A" => Manufacturer::DirectOut,
        // DIGIGRAM
        "000A1E" | "00186D" => Manufacturer::Digigram,
        // TELOS / AXIA
        "00147D" | "34363B" | "78843C" => Manufacturer::TelosAxia,
        // ROSS VIDEO
        "001B21" | "A84E3F" => Manufacturer::Ross,
        _ => Manufacturer::Unknown,
    }
}
