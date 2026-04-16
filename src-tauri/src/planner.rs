use crate::catalog::{Catalog, ItemId, RecipeId};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProductionNode {
    Crafted {
        recipe_id: RecipeId,
        target_item: ItemId,
        rate_per_sec: f64,
        machine_count: f64,
        children: Vec<ProductionNode>,
    },
    RawMaterial {
        item_id: ItemId,
        rate_per_sec: f64,
    },
}

impl ProductionNode {
    pub fn total_machines(&self) -> f64 {
        match self {
            ProductionNode::Crafted { machine_count, children, .. } => {
                *machine_count + children.iter().map(|c| c.total_machines()).sum::<f64>()
            }
            ProductionNode::RawMaterial { .. } => {
                0.0
            }
        }
    }
    pub fn calculate_raw_materials(&self) -> HashMap<ItemId, f64> {
        let mut raw_requirements = HashMap::new();
        self.collect_raw_materials(&mut raw_requirements);
        raw_requirements
    }

    fn collect_raw_materials(&self, map: &mut HashMap<ItemId, f64>) {
        match self {
            ProductionNode::Crafted { children, .. } => {
                for child in children {
                    child.collect_raw_materials(map);
                }
            }
            ProductionNode::RawMaterial { item_id, rate_per_sec } => {
                *map.entry(*item_id).or_insert(0.0) += *rate_per_sec;
            }
        }
    }
}

pub struct Planner<'a> {
    pub catalog: &'a Catalog,
}

impl<'a> Planner<'a> {
    pub fn new(catalog: &'a Catalog) -> Self {
        Self { catalog }
    }

    pub fn calculate_optimal_chain(&self, target_item: ItemId, target_rate_per_sec: f64) -> Result<ProductionNode, String> {
        let mut stack = Vec::new();
        self.find_best_tree(target_item, target_rate_per_sec, &mut stack)
    }

    fn find_best_tree(
        &self,
        target_item: ItemId,
        target_rate: f64,
        stack: &mut Vec<ItemId>
    ) -> Result<ProductionNode, String> {
        if stack.contains(&target_item) {
            return Err("Production cycle detected".to_string());
        }
        stack.push(target_item);

        let candidates: Vec<&crate::catalog::Recipe> = self.catalog.recipes.values()
            .filter(|r| r.outputs.contains_key(&target_item))
            .collect();

        if candidates.is_empty() {
            stack.pop();
            return Ok(ProductionNode::RawMaterial {
                item_id: target_item,
                rate_per_sec: target_rate,
            });
        }

        let mut best_tree: Option<ProductionNode> = None;
        let mut min_machines = f64::MAX;

        for recipe in candidates {
            let output_amount_per_craft = recipe.outputs.get(&target_item).unwrap();
            let crafts_per_sec = 1.0 / recipe.duration;
            let output_per_sec_per_machine = output_amount_per_craft * crafts_per_sec;

            let required_machines = target_rate / output_per_sec_per_machine;

            let mut children = Vec::new();
            let mut all_inputs_resolved = true;

            for (input_item_id, input_amount_per_craft) in &recipe.inputs {
                let input_per_sec_per_machine = input_amount_per_craft * crafts_per_sec;
                let total_input_required_per_sec = input_per_sec_per_machine * required_machines;

                match self.find_best_tree(*input_item_id, total_input_required_per_sec, stack) {
                    Ok(child_node) => children.push(child_node),
                    Err(_) => {
                        all_inputs_resolved = false;
                        break;
                    }
                }
            }

            if all_inputs_resolved {
                let node = ProductionNode::Crafted {
                    recipe_id: recipe.id,
                    target_item,
                    rate_per_sec: target_rate,
                    machine_count: required_machines,
                    children,
                };

                let total_cost = node.total_machines();
                if total_cost < min_machines {
                    min_machines = total_cost;
                    best_tree = Some(node);
                }
            }
        }

        stack.pop();

        best_tree.ok_or_else(|| "A valid production tree could not be established.".to_string())
    }
}