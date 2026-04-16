import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, Handle, Position, useReactFlow, addEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { invoke } from '@tauri-apps/api/core';

// ==========================================
// 1. RECURSIVE TREE COMPONENT (FOR PLANNER)
// ==========================================
function PlanNodeRenderer({ node, catalog }) {
  if (!node) return null;

  if (node.Crafted) {
    const data = node.Crafted;
    const item = catalog.items[data.target_item];
    const recipe = catalog.recipes[data.recipe_id];

    return (
        <div style={{ marginLeft: '10px', paddingLeft: '15px', borderLeft: '2px solid #555', marginTop: '10px' }}>
          <div style={{ color: '#4caf50', fontSize: '14px', fontWeight: 'bold' }}>
            {data.machine_count.toFixed(1)}x Machine <span style={{color: '#888', fontWeight: 'normal', fontSize: '12px'}}>({recipe?.name})</span>
          </div>
          <div style={{ fontSize: '13px', color: '#e0e0e0', marginBottom: '5px' }}>
            Target: <span style={{color: '#00bcd4'}}>{data.rate_per_sec.toFixed(1)}/s</span> {item?.name}
          </div>
          {data.children.map((child, idx) => <PlanNodeRenderer key={idx} node={child} catalog={catalog} />)}
        </div>
    );
  }

  if (node.RawMaterial) {
    const data = node.RawMaterial;
    const item = catalog.items[data.item_id];
    return (
        <div style={{ marginLeft: '10px', paddingLeft: '15px', borderLeft: '2px solid #ff9800', marginTop: '10px' }}>
          <div style={{ color: '#ff9800', fontSize: '13px', fontWeight: 'bold' }}>Raw Material Source (Miner)</div>
          <div style={{ fontSize: '13px', color: '#ccc' }}>Required: <span style={{color: '#ff5722'}}>{data.rate_per_sec.toFixed(1)}/s</span> {item?.name}</div>
        </div>
    );
  }

  return null;
}

// ==========================================
// 2. SMART MACHINE NODE (CUSTOM NODE)
// ==========================================
function MachineNode({ id, data }) {
  const { setNodes } = useReactFlow();
  const { label, catalog, activeRecipeId } = data;

  const handleRecipeChange = (e) => {
    const newRecipeId = e.target.value;
    setNodes((nds) => nds.map((node) => {
      if (node.id === id) return { ...node, data: { ...node.data, activeRecipeId: newRecipeId } };
      return node;
    }));
  };

  const handleRemoveNode = () => {
    setNodes((nds) => nds.filter(node => node.id !== id));
  };

  const activeRecipe = catalog?.recipes?.[activeRecipeId];
  const inputs = activeRecipe ? Object.entries(activeRecipe.inputs) : [];
  const outputs = activeRecipe ? Object.entries(activeRecipe.outputs) : [];

  return (
      <div style={{ position: 'relative', border: '2px solid', borderColor: data.simStatus ? (data.efficiency < 0.99 ? 'red' : '#4caf50') : '#555', borderRadius: '8px', padding: '10px', background: '#222', color: 'white', minWidth: '180px', boxShadow: data.simStatus ? (data.efficiency < 0.99 ? '0 0 15px red' : '0 0 15px #4caf50') : '0 4px 6px rgba(0,0,0,0.3)' }}>

        <button onClick={handleRemoveNode} style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'red', color: 'white', border: '2px solid #222', borderRadius: '50%', width: '22px', height: '22px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', zIndex: 10 }}>X</button>

        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#4caf50', marginBottom: '8px', textAlign: 'center', borderBottom: '1px solid #444', paddingBottom: '4px' }}>
          {label}
        </div>
        <select value={activeRecipeId || ''} onChange={handleRecipeChange} style={{ width: '100%', padding: '4px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', fontSize: '12px', marginBottom: '10px' }}>
          <option value="">-- Select Recipe --</option>
          {Object.values(catalog?.recipes || {}).map(r => <option key={r.id} value={r.id}>{r.name} ({r.duration}s)</option>)}
        </select>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#aaa', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
            {inputs.map(([itemId, amount]) => (
                <div key={`in-${itemId}`} style={{ position: 'relative', height: '18px', display: 'flex', alignItems: 'center' }}>
                  <Handle type="target" position={Position.Left} id={`in-${itemId}`} style={{ background: '#ff9800', width: '10px', height: '10px', left: '-16px' }} />
                  <span>{catalog?.items[itemId]?.name} ({amount})</span>
                </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' }}>
            {outputs.map(([itemId, amount]) => (
                <div key={`out-${itemId}`} style={{ position: 'relative', height: '18px', display: 'flex', alignItems: 'center' }}>
                  <span>{amount}x {catalog?.items[itemId]?.name}</span>
                  <Handle type="source" position={Position.Right} id={`out-${itemId}`} style={{ background: '#00bcd4', width: '10px', height: '10px', right: '-16px' }} />
                </div>
            ))}
          </div>
        </div>

        {data.simStatus && (
            <div style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center', marginTop: '8px', color: data.efficiency < 0.99 ? '#ff5252' : '#4caf50' }}>{data.simStatus}</div>
        )}
      </div>
  );
}

// ==========================================
// 3. MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [catalog, setCatalog] = useState({ items: {}, machines: {}, recipes: {} });
  const loadCatalog = async () => { try { setCatalog(await invoke('get_catalog')); } catch (error) { console.error("Error fetching catalog:", error); } };
  useEffect(() => { loadCatalog(); }, []);

  // --- FORM STATES ---
  const [itemName, setItemName] = useState(''); const [itemType, setItemType] = useState('Solid');
  const [machineName, setMachineName] = useState('');
  const [recipeName, setRecipeName] = useState(''); const [recipeDuration, setRecipeDuration] = useState(5.0);
  const [recipeInputs, setRecipeInputs] = useState([]); const [recipeOutputs, setRecipeOutputs] = useState([{ itemId: '', amount: 1 }]);

  // --- PLANNER STATES ---
  const [planTargetItem, setPlanTargetItem] = useState('');
  const [planTargetRate, setPlanTargetRate] = useState(1.0);
  const [planResult, setPlanResult] = useState(null);

  // --- ADD OPERATIONS ---
  const handleAddItem = async (e) => { e.preventDefault(); if (!itemName) return; await invoke('add_item', { item: { id: crypto.randomUUID(), name: itemName, item_type: itemType } }); setItemName(''); loadCatalog(); };
  const handleAddMachine = async (e) => { e.preventDefault(); if (!machineName) return; await invoke('add_machine', { machine: { id: crypto.randomUUID(), name: machineName } }); setMachineName(''); loadCatalog(); };

  const addInputRow = () => setRecipeInputs([...recipeInputs, { itemId: '', amount: 1 }]);
  const addOutputRow = () => setRecipeOutputs([...recipeOutputs, { itemId: '', amount: 1 }]);
  const updateRecipeList = (list, setList, index, field, value) => { const newList = [...list]; newList[index][field] = value; setList(newList); };
  const removeRecipeList = (list, setList, index) => setList(list.filter((_, i) => i !== index));

  const handleAddRecipe = async (e) => {
    e.preventDefault(); if (!recipeName) return;
    const formatToMap = (list) => { const map = {}; list.forEach(i => { if (i.itemId) map[i.itemId] = parseFloat(i.amount); }); return map; };
    await invoke('add_recipe', { recipe: { id: crypto.randomUUID(), name: recipeName, duration: parseFloat(recipeDuration), inputs: formatToMap(recipeInputs), outputs: formatToMap(recipeOutputs) } });
    setRecipeName(''); setRecipeInputs([]); setRecipeOutputs([{ itemId: '', amount: 1 }]); loadCatalog();
  };

  // --- DELETE OPERATIONS ---
  const handleDeleteItem = async (id) => {
    if(!window.confirm("Are you sure you want to delete this item?")) return;
    try { await invoke('delete_item', { id }); loadCatalog(); } catch (err) { alert("Could not delete: " + err); }
  };
  const handleDeleteMachine = async (id) => {
    if(!window.confirm("Are you sure you want to delete this machine?")) return;
    try { await invoke('delete_machine', { id }); loadCatalog(); } catch (err) { alert("Could not delete: " + err); }
  };
  const handleDeleteRecipe = async (id) => {
    if(!window.confirm("Are you sure you want to delete this recipe?")) return;
    try { await invoke('delete_recipe', { id }); loadCatalog(); } catch (err) { alert("Could not delete: " + err); }
  };

  // --- RUN RUST PLANNER ---
  const handleCalculatePlan = async (e) => {
    e.preventDefault();
    if (!planTargetItem) return;
    try {
      const result = await invoke('calculate_plan', { targetItem: planTargetItem, ratePerSec: parseFloat(planTargetRate) });
      setPlanResult(result);
    } catch (error) { alert("Planning error: " + error); setPlanResult(null); }
  };

  // --- REACT FLOW & SIMULATION ---
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [menu, setMenu] = useState(null);
  const nodeTypes = useMemo(() => ({ customMachine: MachineNode }), []);

  useEffect(() => { setNodes((nds) => nds.map(node => ({ ...node, data: { ...node.data, catalog } }))); }, [catalog, setNodes]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#fff' } }, eds)), [setEdges]);
  const onPaneContextMenu = useCallback((e) => { e.preventDefault(); const bounds = reactFlowWrapper.current.getBoundingClientRect(); setMenu({ x: e.clientX - bounds.left, y: e.clientY - bounds.top }); }, []);
  const onPaneClick = useCallback(() => { setMenu(null); }, []);
  const onAddMachineToCanvas = (machine) => { setNodes((nds) => nds.concat({ id: crypto.randomUUID(), type: 'customMachine', position: { x: menu.x, y: menu.y }, data: { label: machine.name, machineId: machine.id, catalog: catalog, activeRecipeId: null } })); setMenu(null); };

  const handleRunSimulation = async () => {
    if (nodes.length === 0) return;
    const arena = { nodes: [], ports: [], edges: [] };
    const nodeIdMap = {}; const portIdMap = {}; let currentPortId = 0;

    nodes.forEach((rfNode, index) => {
      nodeIdMap[rfNode.id] = index;
      const activeRecipe = catalog.recipes[rfNode.data.activeRecipeId];
      const inputPorts = []; const outputPorts = [];
      if (activeRecipe) {
        Object.keys(activeRecipe.inputs).forEach(itemId => { const pId = currentPortId++; portIdMap[`${rfNode.id}-in-${itemId}`] = pId; arena.ports.push({ id: pId, is_input: true, item_filter: itemId, owner_node: index }); inputPorts.push(pId); });
        Object.keys(activeRecipe.outputs).forEach(itemId => { const pId = currentPortId++; portIdMap[`${rfNode.id}-out-${itemId}`] = pId; arena.ports.push({ id: pId, is_input: false, item_filter: itemId, owner_node: index }); outputPorts.push(pId); });
      }
      arena.nodes.push({ id: index, node_type: { Machine: { machine_id: rfNode.data.machineId, active_recipe: rfNode.data.activeRecipeId || null } }, inputs: inputPorts, outputs: outputPorts, clock_speed: 1.0 });
    });

    edges.forEach(rfEdge => {
      const sourcePortId = portIdMap[`${rfEdge.source}-${rfEdge.sourceHandle}`];
      const targetPortId = portIdMap[`${rfEdge.target}-${rfEdge.targetHandle}`];
      if (sourcePortId !== undefined && targetPortId !== undefined) arena.edges.push([sourcePortId, targetPortId]);
    });

    try {
      const result = await invoke('run_simulation', { arena });
      setNodes(currentNodes => currentNodes.map(node => {
        const nodeResult = result.node_results[nodeIdMap[node.id]];
        if (nodeResult) return { ...node, data: { ...node.data, simStatus: nodeResult.status_message, efficiency: nodeResult.efficiency } };
        return node;
      }));
    } catch (error) { alert("Simulation crash: " + error); }
  };

  const availableItems = Object.values(catalog.items);
  const availableMachines = Object.values(catalog.machines);

  return (
      <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#1e1e1e', color: 'white', fontFamily: 'sans-serif' }}>

        {/* 1. LEFT PANEL (Inventory) */}
        <div style={{ width: '250px', backgroundColor: '#181818', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid #333', color: '#e0e0e0' }}>Inventory</h3>
          <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>

            <h4 style={{ color: '#007acc', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>Catalog</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '13px' }}>
              {availableItems.map(item => (
                  <li key={item.id} style={{ padding: '6px 0', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{item.name} <span style={{fontSize: '10px', color: '#666'}}>({item.item_type})</span></span>
                    <button onClick={() => handleDeleteItem(item.id)} style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                  </li>
              ))}
            </ul>

            <h4 style={{ color: '#4caf50', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Machines</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '13px' }}>
              {availableMachines.map(m => (
                  <li key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{m.name}</span>
                    <button onClick={() => handleDeleteMachine(m.id)} style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                  </li>
              ))}
            </ul>

            <h4 style={{ color: '#ff9800', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Recipes</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
              {Object.values(catalog.recipes).map(r => (
                  <li key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{r.name}</span>
                    <button onClick={() => handleDeleteRecipe(r.id)} style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                  </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 2. MID-LEFT PANEL (Forms) */}
        <div style={{ width: '320px', backgroundColor: '#252526', borderRight: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
          <h2 style={{ margin: 0, color: '#e0e0e0' }}>Catalog Management</h2>

          <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <h3 style={{ margin: 0, fontSize: '13px', color: '#007acc' }}>Add Item</h3>
            <input required value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Name" style={{ padding: '6px', minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }} />
            <select value={itemType} onChange={e => setItemType(e.target.value)} style={{ padding: '6px', minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}><option value="Solid">Solid</option><option value="Liquid">Liquid</option></select>
            <button type="submit" style={{ padding: '6px', background: '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
          </form>

          <hr style={{ borderColor: '#444', width: '100%', margin: '0' }} />

          <form onSubmit={handleAddMachine} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <h3 style={{ margin: 0, fontSize: '13px', color: '#4caf50' }}>Add Machine</h3>
            <input required value={machineName} onChange={e => setMachineName(e.target.value)} placeholder="Name" style={{ padding: '6px', minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }} />
            <button type="submit" style={{ padding: '6px', background: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
          </form>

          <hr style={{ borderColor: '#444', width: '100%', margin: '0' }} />

          <form onSubmit={handleAddRecipe} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #444' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#ff9800' }}>Create New Recipe</h3>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <input required value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="Recipe Name" style={{ flex: 2, minWidth: 0, padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }} />
              <input required type="number" step="0.1" value={recipeDuration} onChange={e => setRecipeDuration(e.target.value)} placeholder="Dur.(s)" title="Production Duration (Seconds)" style={{ flex: 1, minWidth: 0, padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }} />
            </div>

            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', color: '#aaa' }}>Inputs</span>
                <button type="button" onClick={addInputRow} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px' }}>+ Add Input</button>
              </div>
              {recipeInputs.map((row, index) => (
                  <div key={index} style={{ display: 'flex', gap: '5px', marginBottom: '5px', width: '100%' }}>
                    <select required value={row.itemId} onChange={e => updateRecipeList(recipeInputs, setRecipeInputs, index, 'itemId', e.target.value)} style={{ flex: 2, minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '6px' }}><option value="">Select...</option>{availableItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                    <input required type="number" step="0.1" value={row.amount} onChange={e => updateRecipeList(recipeInputs, setRecipeInputs, index, 'amount', e.target.value)} style={{ flex: 1, minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '6px' }} />
                    <button type="button" onClick={() => removeRecipeList(recipeInputs, setRecipeInputs, index)} style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '0 8px' }}>X</button>
                  </div>
              ))}
            </div>

            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', color: '#aaa' }}>Outputs</span>
                <button type="button" onClick={addOutputRow} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px' }}>+ Add Output</button>
              </div>
              {recipeOutputs.map((row, index) => (
                  <div key={index} style={{ display: 'flex', gap: '5px', marginBottom: '5px', width: '100%' }}>
                    <select required value={row.itemId} onChange={e => updateRecipeList(recipeOutputs, setRecipeOutputs, index, 'itemId', e.target.value)} style={{ flex: 2, minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '6px' }}><option value="">Select...</option>{availableItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                    <input required type="number" step="0.1" value={row.amount} onChange={e => updateRecipeList(recipeOutputs, setRecipeOutputs, index, 'amount', e.target.value)} style={{ flex: 1, minWidth: 0, background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '6px' }} />
                    <button type="button" onClick={() => removeRecipeList(recipeOutputs, setRecipeOutputs, index)} style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '0 8px' }}>X</button>
                  </div>
              ))}
            </div>
            <button type="submit" style={{ padding: '10px', background: '#ff9800', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginTop: '5px' }}>Save Recipe</button>
          </form>
        </div>

        {/* 3. CENTER PANEL: REACT FLOW CANVAS */}
        <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onPaneContextMenu={onPaneContextMenu} onPaneClick={onPaneClick} nodeTypes={nodeTypes} fitView theme="dark">
            <Background color="#333" gap={20} />
            <Controls />
          </ReactFlow>

          <button onClick={handleRunSimulation} style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, padding: '10px 20px', background: '#ff9800', color: 'black', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
            Run Simulation
          </button>

          {menu && (
              <div style={{ position: 'absolute', top: menu.y, left: menu.x, backgroundColor: '#252526', border: '1px solid #444', borderRadius: '6px', zIndex: 1000, minWidth: '150px', padding: '5px' }}>
                <div style={{ fontSize: '12px', color: '#aaa', padding: '5px', borderBottom: '1px solid #444', marginBottom: '5px' }}>Place Machine</div>
                {availableMachines.length === 0 && <div style={{ padding: '8px', fontSize: '13px', color: '#666' }}>Add a machine first</div>}
                {availableMachines.map(machine => (
                    <div key={machine.id} onClick={() => onAddMachineToCanvas(machine)} style={{ padding: '8px', fontSize: '14px', cursor: 'pointer', color: '#e0e0e0', borderRadius: '4px' }} onMouseEnter={e => e.target.style.backgroundColor = '#333'} onMouseLeave={e => e.target.style.backgroundColor = 'transparent'}>
                      + {machine.name}
                    </div>
                ))}
              </div>
          )}
        </div>

        {/* 4. RIGHT PANEL: PLANNER SCREEN */}
        <div style={{ width: '350px', backgroundColor: '#1e1e1e', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #333', background: '#252526' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#00bcd4' }}>Factory Planner</h3>
            <form onSubmit={handleCalculatePlan} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select required value={planTargetItem} onChange={e => setPlanTargetItem(e.target.value)} style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}>
                <option value="">Select Target Item...</option>
                {availableItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input required type="number" step="0.1" value={planTargetRate} onChange={e => setPlanTargetRate(e.target.value)} placeholder="Amount" style={{ flex: 1, padding: '8px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }} />
                <span style={{ fontSize: '13px', color: '#aaa' }}>items / sec</span>
              </div>
              <button type="submit" style={{ padding: '10px', background: '#00bcd4', color: 'black', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                Generate Production Tree
              </button>
            </form>
          </div>

          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            {!planResult && <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>Select a target to start planning.</div>}
            {planResult && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: '#fff' }}>Recipe & Requirements</h4>
                  <PlanNodeRenderer node={planResult} catalog={catalog} />
                </div>
            )}
          </div>
        </div>

      </div>
  );
}