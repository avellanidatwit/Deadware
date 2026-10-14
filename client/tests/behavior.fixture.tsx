import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BehaviorEditor} from '../src/ui/BehaviorEditor';
import {ScriptLibraryControls} from '../src/ui/ScriptLibraryControls';
import '../src/style.css';
const initial='WHEN distance nearest zombie <= 2\n    ATTACK nearest zombie\nWHEN health < 35 AND hasItem bandage\n    USE bandage\nWHEN count zombie 6 >= 3\n    SPRINT MOVE_AWAY nearest zombie\nOTHERWISE\n    EXPLORE';
function Fixture(){const [script,setScript]=useState(initial);return <main><h1>Survivor behavior</h1><ScriptLibraryControls kind="survivor" code={script} programs={[]} busy={false} onChange={setScript} onSave={async()=>undefined} onDelete={async()=>false}/><BehaviorEditor script={script} onChange={setScript}/><output data-testid="script" hidden>{script}</output></main>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
