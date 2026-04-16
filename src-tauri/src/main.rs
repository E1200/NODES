#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod catalog;
pub mod graph;
pub mod planner;
pub mod simulator;
pub mod data;

use std::sync::Mutex;
use tauri::State;
use catalog::Catalog;
use data::CatalogManager as Persistence;

// State Management
pub struct AppState {
    pub catalog: Mutex<Catalog>,
}

// Tauri Commands

#[tauri::command]
fn get_catalog(state: State<AppState>) -> Result<Catalog, String> {
    let catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    Ok(catalog.clone())
}

#[tauri::command]
fn add_item(state: State<AppState>, item: catalog::Item) -> Result<(), String> {
    let mut catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    catalog.items.insert(item.id, item);

    Persistence::save_catalog(&catalog, None)?;
    Ok(())
}

#[tauri::command]
fn add_machine(state: State<AppState>, machine: catalog::Machine) -> Result<(), String> {
    let mut catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    catalog.machines.insert(machine.id, machine);

    Persistence::save_catalog(&catalog, None)?;
    Ok(())
}

#[tauri::command]
fn add_recipe(state: State<AppState>, recipe: catalog::Recipe) -> Result<(), String> {
    let mut catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    catalog.recipes.insert(recipe.id, recipe);

    Persistence::save_catalog(&catalog, None)?;
    Ok(())
}

#[tauri::command]
fn calculate_plan(
    state: State<AppState>,
    target_item: catalog::ItemId,
    rate_per_sec: f64
) -> Result<planner::ProductionNode, String> {
    let catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;

    let planner = planner::Planner::new(&catalog);
    planner.calculate_optimal_chain(target_item, rate_per_sec)
}

#[tauri::command]
fn delete_item(state: State<AppState>, id: catalog::ItemId) -> Result<(), String> {
    let mut catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    catalog.items.remove(&id);
    Persistence::save_catalog(&catalog, None)?;
    Ok(())
}

#[tauri::command]
fn delete_machine(state: State<AppState>, id: catalog::MachineId) -> Result<(), String> {
    let mut catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    catalog.machines.remove(&id);
    Persistence::save_catalog(&catalog, None)?;
    Ok(())
}

#[tauri::command]
fn delete_recipe(state: State<AppState>, id: catalog::RecipeId) -> Result<(), String> {
    let mut catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;
    catalog.recipes.remove(&id);
    Persistence::save_catalog(&catalog, None)?;
    Ok(())
}

#[tauri::command]
fn run_simulation(
    state: State<AppState>,
    arena: graph::FactoryArena
) -> Result<simulator::SimulationResult, String> {
    let catalog = state.catalog.lock().map_err(|_| "Couldn't locked the state.".to_string())?;

    let simulator = simulator::Simulator::new(&catalog, &arena);
    Ok(simulator.run_simulation())
}

// --- MAIN FUNCTION ---
fn main() {
    println!("Project Alpha Backend Başlatılıyor...");

    let loaded_catalog = match Persistence::load_catalog(None) {
        Ok(c) => {
            println!(" Catalog successfully loaded. ({} item, {} machine, {} recipe)",
                     c.items.len(), c.machines.len(), c.recipes.len());
            c
        },
        Err(e) => {
            eprintln!("An error occurred while loading the catalog: {}. Starting a new catalog.", e);
            Catalog::default()
        }
    };

    tauri::Builder::default()
        .manage(AppState {
            catalog: Mutex::new(loaded_catalog),
        })
        .invoke_handler(tauri::generate_handler![
            get_catalog,
            add_item,
            add_machine,
            add_recipe,
            calculate_plan,
            delete_item,
            delete_machine,
            delete_recipe,
            run_simulation
        ])
        .run(tauri::generate_context!())
        .expect("An error occurred while loading the tauri");
}