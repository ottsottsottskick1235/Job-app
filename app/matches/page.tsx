'use client';

import { useState } from 'react';

export default function MatchesPage() {
  const [result, setResult] = useState('');

  async function run() {
    const response = await fetch('/api/matches/run', { method: 'POST' });
    setResult(JSON.stringify(await response.json(), null, 2));
  }

  return (
    <main>
      <h1>Matching</h1>
      <p>This checks every active worker against every open job and creates applications only for hard matches.</p>
      <button onClick={run}>Run matching</button>
      <pre>{result}</pre>
    </main>
  );
}
