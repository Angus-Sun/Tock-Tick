import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import WebcamFeed from './components/WebcamFeed'
import PoseRecorder from './components/PoseRecorder'
import sampleReference from './data/referenceSequence.sample.json'

function App() {
  const [count, setCount] = useState(0)

  const [referenceSequence, setReferenceSequence] = useState([]);

  function onFileUpload(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        setReferenceSequence(json);
      } catch (err) {
        alert('Failed to parse JSON: ' + err.message);
      }
    };
    reader.readAsText(f);
  }

  function loadSample() {
    setReferenceSequence(sampleReference);
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <section style={{ marginTop: 24 }}>
        <h2>Live Pose Demo</h2>
        <div style={{ marginBottom: 8 }}>
          <label style={{ marginRight: 8 }}>
            Load reference JSON:
            <input type="file" accept="application/json" onChange={onFileUpload} style={{ marginLeft: 8 }} />
          </label>
          <button onClick={loadSample}>Load sample reference</button>
          <div style={{ marginTop: 6, fontSize: 13 }}>Loaded steps: {referenceSequence.length}</div>
        </div>
        <WebcamFeed referenceSequence={referenceSequence} />
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Record Reference Steps</h2>
        <PoseRecorder />
      </section>
    </>
  )
}

export default App
