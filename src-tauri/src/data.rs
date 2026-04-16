use std::fs;
use std::path::Path;
use crate::catalog::Catalog;
use std::io::Write;

pub struct CatalogManager;

const DEFAULT_PATH: &str = "catalog.json";

impl CatalogManager {
    /// Read catalog from file.
    pub fn load_catalog(path: Option<&str>) -> Result<Catalog, String> {
        let file_path = path.unwrap_or(DEFAULT_PATH);

        if Path::new(file_path).exists() {
            let content = fs::read_to_string(file_path)
                .map_err(|e| format!("File couldn't be read: {}", e))?;

            match serde_json::from_str(&content) {
                Ok(catalog) => return Ok(catalog),
                Err(e) => {
                    let _ = fs::copy(file_path, format!("{}.bak", file_path));
                    return Err(format!("JSON format is corrupted: {}", e));
                }
            }
        }

        Ok(Catalog::default())
    }

    pub fn save_catalog(catalog: &Catalog, path: Option<&str>) -> Result<(), String> {
        let file_path = path.unwrap_or(DEFAULT_PATH);

        let json_data = serde_json::to_string_pretty(catalog)
            .map_err(|e| format!("JSON conversion error: {}", e))?;

        let mut file = fs::File::create(file_path)
            .map_err(|e| format!("File couldn't be created: {}", e))?;

        file.write_all(json_data.as_bytes())
            .map_err(|e| format!("Couldn't write to the file: {}", e))?;

        Ok(())
    }
}