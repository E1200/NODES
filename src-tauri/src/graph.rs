use crate::catalog::{ItemId, RecipeId, MachineId};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PortId(pub usize);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    pub id:          PortId,
    pub is_input:    bool,
    pub item_filter: Option<ItemId>,
    pub owner_node:  Option<NodeId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeType {
    Machine {
        machine_id: MachineId,
        active_recipe: Option<RecipeId>,
    },
    Splitter,
    Merger,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryNode {
    pub id:            NodeId,
    pub node_type:     NodeType,
    pub inputs:        Vec<PortId>,
    pub outputs:       Vec<PortId>,
    pub clock_speed:   f64,
}

pub type Edge = (PortId, PortId);

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FactoryArena {
    pub nodes: Vec<FactoryNode>,
    pub ports: Vec<Port>,
    pub edges: Vec<Edge>,
}

impl FactoryArena {
    pub fn alloc_port(&mut self, is_input: bool, item_filter: Option<ItemId>) -> PortId {
        let id = PortId(self.ports.len());
        self.ports.push(Port { id, is_input, item_filter, owner_node: None });
        id
    }

    pub fn alloc_machine(
        &mut self,
        machine_id: MachineId,
        active_recipe: Option<RecipeId>,
        clock_speed: f64,
        inputs: Vec<PortId>,
        outputs: Vec<PortId>
    ) -> NodeId {
        let id = NodeId(self.nodes.len());
        self.nodes.push(FactoryNode {
            id,
            node_type: NodeType::Machine { machine_id, active_recipe },
            inputs: inputs.clone(),
            outputs: outputs.clone(),
            clock_speed,
        });

        for port_id in inputs.into_iter().chain(outputs.into_iter()) {
            if let Some(port) = self.ports.get_mut(port_id.0) {
                port.owner_node = Some(id);
            }
        }
        id
    }

    pub fn alloc_splitter(&mut self, inputs: Vec<PortId>, outputs: Vec<PortId>) -> NodeId {
        let id = NodeId(self.nodes.len());
        self.nodes.push(FactoryNode {
            id,
            node_type: NodeType::Splitter,
            inputs: inputs.clone(),
            outputs: outputs.clone(),
            clock_speed: 1.0,
        });

        for port_id in inputs.into_iter().chain(outputs.into_iter()) {
            if let Some(port) = self.ports.get_mut(port_id.0) {
                port.owner_node = Some(id);
            }
        }
        id
    }

    pub fn alloc_merger(&mut self, inputs: Vec<PortId>, outputs: Vec<PortId>) -> NodeId {
        let id = NodeId(self.nodes.len());
        self.nodes.push(FactoryNode {
            id,
            node_type: NodeType::Merger,
            inputs: inputs.clone(),
            outputs: outputs.clone(),
            clock_speed: 1.0,
        });

        for port_id in inputs.into_iter().chain(outputs.into_iter()) {
            if let Some(port) = self.ports.get_mut(port_id.0) {
                port.owner_node = Some(id);
            }
        }
        id
    }

    pub fn connect(&mut self, from: PortId, to: PortId) -> Result<(), &'static str> {
        let from_port = self.ports.get(from.0).ok_or("Source port not found")?;
        let to_port = self.ports.get(to.0).ok_or("Target port not found")?;

        if from_port.is_input { return Err("Source port must be(output)."); }
        if !to_port.is_input { return Err("Target port must be(input).FF"); }

        self.edges.push((from, to));
        Ok(())
    }
}