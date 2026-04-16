use std::collections::{HashMap, VecDeque};
use crate::catalog::{Catalog, ItemId};
use crate::graph::{FactoryArena, NodeId, PortId, NodeType};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortFlow {
    pub item_id: Option<ItemId>,
    pub rate_per_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSimulationResult {
    pub efficiency: f64,
    pub actual_consumption: HashMap<ItemId, f64>,
    pub actual_production: HashMap<ItemId, f64>,
    pub wasted_items: HashMap<ItemId, f64>,
    pub status_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    pub port_flows: HashMap<usize, PortFlow>,
    pub node_results: HashMap<usize, NodeSimulationResult>,
}

pub struct Simulator<'a> {
    pub catalog: &'a Catalog,
    pub arena: &'a FactoryArena,
}

impl<'a> Simulator<'a> {
    pub fn new(catalog: &'a Catalog, arena: &'a FactoryArena) -> Self {
        Self { catalog, arena }
    }

    pub fn run_simulation(&self) -> SimulationResult {
        let mut port_flows: HashMap<usize, PortFlow> = HashMap::new();
        let mut node_results: HashMap<usize, NodeSimulationResult> = HashMap::new();

        let mut in_degrees = HashMap::new();
        for node in &self.arena.nodes {
            in_degrees.insert(node.id.0, 0);
        }

        let mut node_edges: HashMap<usize, Vec<usize>> = HashMap::new();
        for (from_port, to_port) in &self.arena.edges {
            let from_node = self.arena.ports[from_port.0].owner_node;
            let to_node = self.arena.ports[to_port.0].owner_node;

            if let (Some(src_id), Some(tgt_id)) = (from_node, to_node) {
                if src_id != tgt_id {
                    *in_degrees.entry(tgt_id.0).or_insert(0) += 1;
                    node_edges.entry(src_id.0).or_insert_with(Vec::new).push(tgt_id.0);
                }
            }
        }

        let mut queue = VecDeque::new();
        for (node_id, degree) in &in_degrees {
            if *degree == 0 {
                queue.push_back(*node_id);
            }
        }

        while let Some(current_node_id) = queue.pop_front() {
            let node = &self.arena.nodes[current_node_id];

            let mut available_inputs: HashMap<ItemId, f64> = HashMap::new();
            for input_port_id in &node.inputs {
                if let Some(flow) = port_flows.get(&input_port_id.0) {
                    if let Some(item) = flow.item_id {
                        *available_inputs.entry(item).or_insert(0.0) += flow.rate_per_sec;
                    }
                }
            }

            let mut efficiency = 1.0;
            let mut actual_consumption = HashMap::new();
            let mut actual_production = HashMap::new();
            let mut wasted_items = HashMap::new();
            let mut status_message = "Working Normal ".to_string();

            match &node.node_type {
                NodeType::Machine { active_recipe, .. } => {
                    if let Some(recipe_id) = active_recipe {
                        if let Some(recipe) = self.catalog.recipes.get(recipe_id) {
                            let crafts_per_sec = (1.0 / recipe.duration) * node.clock_speed;

                            let mut required_inputs = HashMap::new();
                            for (item_id, amount) in &recipe.inputs {
                                required_inputs.insert(*item_id, amount * crafts_per_sec);
                            }

                            for (req_item, req_amount) in &required_inputs {
                                let available = available_inputs.get(req_item).copied().unwrap_or(0.0);
                                if available < *req_amount {
                                    let current_efficiency = available / req_amount;
                                    if current_efficiency < efficiency {
                                        efficiency = current_efficiency;
                                    }
                                }
                            }

                            if efficiency < 0.99 {
                                status_message = format!("Bottleneck! Productivity Rate: %{:.1}", efficiency * 100.0);
                            }

                            for (item_id, amount) in &recipe.inputs {
                                let consumed = amount * crafts_per_sec * efficiency;
                                actual_consumption.insert(*item_id, consumed);

                                let supplied = available_inputs.get(item_id).copied().unwrap_or(0.0);
                                let wasted = supplied - consumed;
                                if wasted > 0.0001 {
                                    wasted_items.insert(*item_id, wasted);
                                }
                            }

                            for (item_id, amount) in &recipe.outputs {
                                actual_production.insert(*item_id, amount * crafts_per_sec * efficiency);
                            }
                        } else {
                            status_message = "Recipe not found".to_string();
                            efficiency = 0.0;
                        }
                    } else {
                        status_message = "No active recipe".to_string();
                        efficiency = 0.0;
                    }
                }
                NodeType::Merger => {

                    for (item_id, amount) in &available_inputs {
                        actual_production.insert(*item_id, *amount);
                        actual_consumption.insert(*item_id, *amount);
                    }
                    status_message = "Merger Active".to_string();
                }
                NodeType::Splitter => {
                    let out_count = node.outputs.len() as f64;
                    if out_count > 0.0 {
                        for (item_id, amount) in &available_inputs {
                            actual_consumption.insert(*item_id, *amount);
                            actual_production.insert(*item_id, *amount);
                        }
                    }
                    status_message = "Splitter Active".to_string();
                }
            }

            node_results.insert(current_node_id, NodeSimulationResult {
                efficiency,
                actual_consumption,
                actual_production: actual_production.clone(),
                wasted_items,
                status_message,
            });

            match &node.node_type {
                NodeType::Splitter => {
                    let out_count = node.outputs.len() as f64;
                    if out_count > 0.0 {
                        for output_port_id in &node.outputs {
                            for (item_id, total_amount) in &actual_production {
                                port_flows.insert(output_port_id.0, PortFlow {
                                    item_id: Some(*item_id),
                                    rate_per_sec: total_amount / out_count,
                                });
                            }
                        }
                    }
                }
                _ => {
                    let mut remaining_production = actual_production.clone();
                    for output_port_id in &node.outputs {
                        if let Some((&item_id, &amount)) = remaining_production.iter().next() {
                            port_flows.insert(output_port_id.0, PortFlow {
                                item_id: Some(item_id),
                                rate_per_sec: amount,
                            });
                            remaining_production.remove(&item_id);
                        }
                    }
                }
            }

            for (from_port, to_port) in &self.arena.edges {
                if let Some(flow) = port_flows.get(&from_port.0).cloned() {
                    let owner = self.arena.ports[from_port.0].owner_node;
                    if owner == Some(NodeId(current_node_id)) {
                        port_flows.insert(to_port.0, flow);
                    }
                }
            }

            if let Some(neighbors) = node_edges.get(&current_node_id) {
                for neighbor in neighbors {
                    if let Some(deg) = in_degrees.get_mut(neighbor) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(*neighbor);
                        }
                    }
                }
            }
        }

        SimulationResult {
            port_flows,
            node_results,
        }
    }
}