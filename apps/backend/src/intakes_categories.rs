use axum::{http::StatusCode, Json};

use crate::{validation_error, ErrorResponse};

pub(crate) const MAIN_CATEGORIES: [&str; 10] = [
    "Wohnzimmer",
    "Schlafzimmer",
    "Küche",
    "Kinderzimmer",
    "Büro",
    "Flur & Garderobe",
    "Badezimmer",
    "Esszimmer",
    "Gartenmöbel",
    "Dekoration",
];

pub(crate) fn normalize_optional_category_main(
    value: Option<String>,
) -> Result<Option<String>, (StatusCode, Json<ErrorResponse>)> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if MAIN_CATEGORIES.contains(&trimmed) {
        return Ok(Some(trimmed.to_string()));
    }
    Err(validation_error(
        "invalid_category_main",
        "category_main is not allowed",
    ))
}

pub(crate) fn normalize_optional_category_sub(
    main: Option<&str>,
    value: Option<String>,
) -> Result<Option<String>, (StatusCode, Json<ErrorResponse>)> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let Some(main_value) = main else {
        return Err(validation_error(
            "invalid_category_sub",
            "category_sub requires category_main",
        ));
    };
    let allowed = subcategories_for_main(main_value).ok_or_else(|| {
        validation_error("invalid_category_main", "category_main is not allowed")
    })?;
    if allowed.contains(&trimmed) {
        return Ok(Some(trimmed.to_string()));
    }
    Err(validation_error(
        "invalid_category_sub",
        "category_sub is not allowed for selected category_main",
    ))
}

fn subcategories_for_main(main: &str) -> Option<&'static [&'static str]> {
    match main {
        "Wohnzimmer" => Some(&[
            "Sofas",
            "Ecksofas",
            "Schlafsofas",
            "Wohnlandschaften",
            "Sessel",
            "Relaxsessel",
            "Hocker",
            "Couchtische",
            "Beistelltische",
            "TV Lowboards",
            "Wohnwände",
            "Vitrinen",
            "Kommoden",
            "Sideboards",
            "Highboards",
            "Regale",
            "Wandregale",
            "Konsolentische",
        ]),
        "Schlafzimmer" => Some(&[
            "Betten",
            "Boxspringbetten",
            "Polsterbetten",
            "Massivholzbetten",
            "Metallbetten",
            "Einzelbetten",
            "Doppelbetten",
            "Kingsize Betten",
            "Kinderbetten",
            "Hochbetten",
            "Etagenbetten",
            "Nachttische",
            "Kleiderschränke",
            "Drehtürenschränke",
            "Schwebetürenschränke",
            "Eckschränke",
            "Kommoden",
            "Schminktische",
            "Schlafzimmer Sets",
        ]),
        "Esszimmer" => Some(&[
            "Esstische",
            "Ausziehtische",
            "Runde Esstische",
            "Essgruppen",
            "Esszimmerstühle",
            "Polsterstühle",
            "Freischwinger",
            "Sitzbänke",
            "Barhocker",
            "Sideboards",
            "Highboards",
            "Buffetschränke",
            "Vitrinen",
        ]),
        "Küche" => Some(&[
            "Einbauküchen",
            "Küchenzeilen",
            "Küchenschränke",
            "Hängeschränke",
            "Unterschränke",
            "Kücheninseln",
            "Küchentische",
            "Bartische",
            "Barhocker",
            "Küchenregale",
        ]),
        "Büro" => Some(&[
            "Schreibtische",
            "Computertische",
            "Eckschreibtische",
            "Bürostühle",
            "Drehstühle",
            "Chefsessel",
            "Aktenschränke",
            "Rollcontainer",
            "Bücherregale",
            "Konferenztische",
        ]),
        "Flur & Garderobe" => Some(&[
            "Garderoben",
            "Garderobenschränke",
            "Schuhschränke",
            "Schuhbänke",
            "Sitzbänke",
            "Konsolentische",
            "Flurkommoden",
            "Spiegel",
        ]),
        "Badezimmer" => Some(&[
            "Waschbeckenunterschränke",
            "Spiegelschränke",
            "Badhochschränke",
            "Badregale",
            "Badmöbel Sets",
        ]),
        "Kinderzimmer" => Some(&[
            "Kinderbetten",
            "Etagenbetten",
            "Hochbetten",
            "Babybetten",
            "Wickelkommoden",
            "Kinderkommoden",
            "Kinderkleiderschränke",
            "Kinderschreibtische",
            "Kinderstühle",
            "Kinderzimmer Sets",
        ]),
        "Gartenmöbel" => Some(&[
            "Gartentische",
            "Gartenstühle",
            "Gartensessel",
            "Gartenbänke",
            "Loungemöbel",
            "Sonnenliegen",
            "Hängesessel",
            "Gartensofas",
            "Gartenmöbel Sets",
        ]),
        "Dekoration" => Some(&[
            "Vasen",
            "Skulpturen & Figuren",
            "Wandbilder & Kunst",
            "Wanduhren",
            "Kerzen & Kerzenhalter",
            "Spiegel",
            "Dekoschalen & Tablett",
        ]),
        _ => None,
    }
}
