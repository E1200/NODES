use std::collections::HashMap;
use uuid::Uuid;
use serde::{Serialize, Deserialize};

pub type ItemId    = Uuid;
pub type RecipeId  = Uuid;
pub type MachineId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ItemType {
    Solid,
    Liquid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id:   ItemId,
    pub name: String,
    pub item_type: ItemType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub id:       RecipeId,
    pub name:     String,
    pub inputs:   HashMap<ItemId, f64>,
    pub outputs:  HashMap<ItemId, f64>,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Machine {
    pub id:   MachineId,
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub items:    HashMap<ItemId,    Item>,
    pub recipes:  HashMap<RecipeId,  Recipe>,
    pub machines: HashMap<MachineId, Machine>,
}